import GoogleAuth, {
	type GoogleKey,
} from "cloudflare-workers-and-google-oauth";
/** FIXME: Add Response Type */
export class CalendarClient {
	private token = "";
	constructor(token: string) {
		this.token = token;
	}

	public static async init(credentials: string) {
		const oauth = new GoogleAuth(parseGoogleCredentials(credentials), [
			"https://www.googleapis.com/auth/calendar.readonly",
		]);
		const token = await oauth.getGoogleAuthToken();
		if (!token) {
			throw new Error("Failed to get Google Auth Token");
		}
		return new CalendarClient(token);
	}

	/**
	 * https://developers.google.com/calendar/api/v3/reference/events/list?hl=ja
	 */
	public getCalendarEventsByCalendarId = async (
		calendarId: string,
		nextSyncToken?: string,
	) => {
		const params = new URLSearchParams({
			singleEvents: "true",
			showDeleted: nextSyncToken ? "true" : "false",
			...(nextSyncToken ? { syncToken: nextSyncToken } : {}),
		});
		const res = await fetch(
			`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${this.token}`,
					"content-type": "application/json",
					accept: "application/json",
				},
			},
		);

		// https://developers.google.com/calendar/api/v3/reference/events?hl=ja#resource
		const json = await res.json<{
			nextSyncToken: string | undefined;
			items: {
				status: "confirmed" | "tentative" | "cancelled";
				summary: string;
				description: string;
				created: string; // ex. "2024-03-09T04:21:19.000Z"
				updated: string; // ex. "2024-03-09T05:33:33.274Z"
				creator: { email: string; self: boolean };
				visibility: "private";
				start: {
					date?: string; // YYYY-MM-DD 終日の時;
					dateTime?: string; // ex. "2024-03-09T17:00:00+09:00";
					timeZone: string;
				};
				end: {
					date?: string; // YYYY-MM-DD 終日の時;
					dateTime?: string; // ex. "2024-03-09T17:00:00+09:00";
					timeZone: string;
				};
				extendedProperties?: Record<string, unknown>;
			}[];
		}>();
		return json;
	};

	/**
	 * https://developers.google.com/calendar/api/guides/push?hl=ja
	 */
	public createNotificationChannel = async (
		id: string,
		calendar_id: string,
		address: string,
	) => {
		const res = await fetch(
			`https://www.googleapis.com/calendar/v3/calendars/${calendar_id}/events/watch`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${this.token}`,
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					id,
					type: "web_hook",
					address,
				}),
			},
		);

		if (!res.ok) {
			throw new Error("Failed to create notification channel");
		}

		const { resourceId, expiration } = await res.json<{
			resourceId: string;
			expiration: number;
		}>();
		return {
			resourceId,
			expiration,
		};
	};

	/**
	 * https://developers.google.com/calendar/api/guides/push?hl=ja#stop-notifications
	 */
	public deleteNotificationChannel = async (id: string, resourceId: string) => {
		const res = await fetch(
			"https://www.googleapis.com/calendar/v3/channels/stop",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${this.token}`,
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					id,
					resourceId,
				}),
			},
		);
		return res.ok;
	};
}

const parseGoogleCredentials = (credentials: string): GoogleKey => {
	return JSON.parse(atob(credentials));
};
