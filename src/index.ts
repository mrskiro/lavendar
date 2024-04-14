import { addDay, format, isBefore, sameDay, sameMinute } from "@formkit/tempo";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { CalendarClient } from "./calendar-client";
import {
	createCalendar,
	createNotificationChannel,
	deleteCalendar,
	deleteNotificationChannel,
	findAllCalendars,
	findAllNotificationChannels,
	findCalendarIdByNotificationChannelId,
	findNextSyncTokenByCalendarId,
	upsertNextSyncTokenByCalendarId,
} from "./d1";

type Env = {
	GOOGLE_CREDENTIALS: string;
	LINE_ACCESS_TOKEN: string;
	CALENDAR_IDS: string;
	API_HOST: string;
	DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();
app.use(logger());

app.get("/", (c) => {
	return c.json({ message: "ok" });
});

app.post("/calendars/webhook", async (c) => {
	const channelId = c.req.header("x-goog-channel-id");
	if (!channelId) {
		throw new HTTPException(403, { message: "Not found x-goog-channel-id" });
	}

	const calendarId = await findCalendarIdByNotificationChannelId(
		c.env.DB,
		channelId,
	);
	if (!calendarId) {
		throw new HTTPException(500, {
			message: "Not found calendar_id from internal",
		});
	}
	const calendarClient = await CalendarClient.init(c.env.GOOGLE_CREDENTIALS);

	const state = c.req.header("x-goog-resource-state");
	const isChannelCreated = state === "sync";
	if (isChannelCreated) {
		const { nextSyncToken } =
			await calendarClient.getCalendarEventsByCalendarId(calendarId);
		if (!nextSyncToken) {
			throw new HTTPException(500, { message: "Failed to get nextSyncToken" });
		}
		await upsertNextSyncTokenByCalendarId(c.env.DB, calendarId, nextSyncToken);
		return c.json({ message: "ok" });
	}

	const nextSyncToken = await findNextSyncTokenByCalendarId(
		c.env.DB,
		calendarId,
	);
	if (!nextSyncToken) {
		throw new HTTPException(500, {
			message: "Failed to get nextSyncToken from internal",
		});
	}

	const calendarEvents = await calendarClient.getCalendarEventsByCalendarId(
		calendarId,
		nextSyncToken,
	);

	if (calendarEvents.nextSyncToken) {
		await upsertNextSyncTokenByCalendarId(
			c.env.DB,
			calendarId,
			calendarEvents.nextSyncToken,
		);
	}
	const messages = calendarEvents.items.map((item) => {
		const isCreated = sameMinute(
			new Date(item.created),
			new Date(item.updated),
		);
		const isDeleted = item.status === "cancelled";

		const startDate = new Date(item.start.date ?? item.start.dateTime ?? "");
		const endDate = new Date(item.end.date ?? item.end.dateTime ?? "");

		const isSameDay = sameDay(startDate, endDate);
		const dateLabel = isSameDay
			? `${format({
					date: startDate,
					format: "M月D日(d) HH:mm",
					locale: "ja-JP",
					tz: item.start.timeZone,
			  })} - ${format({
					date: endDate,
					format: "HH:mm",
					locale: "ja-JP",
					tz: item.end.timeZone,
			  })}`
			: `${format({
					date: startDate,
					format: "M月D日(d) HH:mm",
					locale: "ja-JP",
					tz: item.start.timeZone,
			  })} 〜 ${format({
					date: endDate,
					format: "M月D日(d) HH:mm",
					locale: "ja-JP",
					tz: item.end.timeZone,
			  })}`;
		const text = `${calendarId}\n
以下の予定が${isDeleted ? "削除" : isCreated ? "追加" : "編集"}されました🪻\n
${item.summary}
${dateLabel}`;
		return {
			type: "text",
			text,
		};
	});

	await fetch("https://api.line.me/v2/bot/message/broadcast", {
		body: JSON.stringify({
			messages,
		}),
		method: "POST",
		headers: {
			Authorization: `Bearer ${c.env.LINE_ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
	});
	return c.json({ message: "ok" });
});

app.delete("/calendars/channel", async (c) => {
	const body = await c.req.json();
	const { id, resourceId } = body;
	const calendarClient = await CalendarClient.init(c.env.GOOGLE_CREDENTIALS);
	calendarClient.deleteNotificationChannel(id, resourceId);
	await deleteNotificationChannel(c.env.DB, id);
	return c.json({ message: "ok" });
});

export default {
	fetch: app.fetch,
	scheduled: async (
		event: ScheduledEvent,
		env: Env,
		_ctx: ExecutionContext,
	) => {
		switch (event.cron) {
			// check expiration channel
			// 毎日9時に実行
			case "0 9 * * *": {
				const calendarClient = await CalendarClient.init(
					env.GOOGLE_CREDENTIALS,
				);

				const { results } = await findAllNotificationChannels(env.DB);
				for (const result of results) {
					const targetDate = addDay(new Date(), -1);
					const expirationDate = new Date(result.expiration);

					if (isBefore(targetDate, expirationDate)) {
						continue;
					}

					await deleteNotificationChannel(env.DB, result.id);
					await calendarClient.deleteNotificationChannel(
						result.id,
						result.resourceId,
					);

					try {
						const id = crypto.randomUUID();
						const { resourceId, expiration } =
							await calendarClient.createNotificationChannel(
								id,
								result.calendar_id,
								`${env.API_HOST}/calendars/webhook`,
							);
						await createNotificationChannel(env.DB, {
							id,
							calendarId: result.calendar_id,
							resourceId,
							expiration: expiration.toString(),
						});
						console.log(
							`delete channel: ${result.id}, and create channel: ${id}`,
						);
					} catch (error) {
						console.error(error);
					}
				}
				break;
			}

			// create notification channel if not exists
			// 毎日1時に実行
			case "1 0 * * *": {
				const { results: raw } = await findAllCalendars(env.DB);
				const calendarIds = env.CALENDAR_IDS.split(",");

				for (const calendarId of calendarIds) {
					if (!raw.find((v) => v.id === calendarId)) {
						await createCalendar(env.DB, calendarId);
					}
				}
				for (const calendar of raw) {
					if (!calendarIds.includes(calendar.id)) {
						await deleteCalendar(env.DB, calendar.id);
					}
				}

				const { results: calendars } = await findAllCalendars(env.DB);
				const calendarClient = await CalendarClient.init(
					env.GOOGLE_CREDENTIALS,
				);

				const { results: notificationChannels } =
					await findAllNotificationChannels(env.DB);

				for (const calendar of calendars) {
					if (notificationChannels.find((v) => v.calendar_id === calendar.id)) {
						continue;
					}

					const id = crypto.randomUUID();
					const { resourceId, expiration } =
						await calendarClient.createNotificationChannel(
							id,
							calendar.id,
							`${env.API_HOST}/calendars/webhook`,
						);
					await createNotificationChannel(env.DB, {
						id,
						calendarId: calendar.id,
						resourceId,
						expiration: expiration.toString(),
					});
				}
				break;
			}

			default:
				break;
		}
	},
};
