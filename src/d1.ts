export const findAllCalendars = async (db: D1Database) => {
	return await db
		.prepare("SELECT id FROM calendars WHERE deleted_at IS NULL")
		.all<{
			id: string;
		}>();
};

export const createCalendar = async (
	db: D1Database,
	id: string,
): Promise<void> => {
	await db.prepare("INSERT INTO calendars (id) VALUES (?)").bind(id).all();
};

export const deleteCalendar = async (
	db: D1Database,
	id: string,
): Promise<void> => {
	await db
		.prepare("UPDATE calendars SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
		.bind(id)
		.run();
};

export const findNextSyncTokenByCalendarId = async (
	db: D1Database,
	calendarId: string,
): Promise<string | null> => {
	const data = await db
		.prepare(
			"SELECT token FROM calendar_sync_tokens WHERE calendar_id = ? ORDER BY created_at DESC LIMIT 1",
		)
		.bind(calendarId)
		.first<{ token: string }>();

	return data?.token ?? null;
};

export const upsertNextSyncTokenByCalendarId = async (
	db: D1Database,
	calendarId: string,
	token: string,
): Promise<void> => {
	await db
		.prepare(
			`INSERT INTO calendar_sync_tokens (calendar_id, token)
	VALUES (?, ?)
	ON CONFLICT(calendar_id) DO UPDATE SET token = ?, updated_at = CURRENT_TIMESTAMP;`,
		)
		.bind(calendarId, token, token)
		.all();
};

export const createNotificationChannel = async (
	db: D1Database,
	data: {
		id: string;
		calendarId: string;
		resourceId: string;
		expiration: string;
	},
): Promise<void> => {
	await db
		.prepare(
			"INSERT INTO notification_channels (id, calendar_id, resourceId, expiration) VALUES (?, ?, ?, ?);",
		)
		.bind(data.id, data.calendarId, data.resourceId, data.expiration)
		.all();
};

export const findAllNotificationChannels = async (db: D1Database) => {
	return await db
		.prepare(
			"SELECT id, calendar_id, resourceId, expiration FROM notification_channels WHERE deleted_at IS NULL",
		)
		.all<{
			id: string;
			calendar_id: string;
			resourceId: string;
			expiration: string;
		}>();
};

export const findCalendarIdByNotificationChannelId = async (
	db: D1Database,
	id: string,
): Promise<string | null> => {
	const data = await db
		.prepare(
			"SELECT calendar_id FROM notification_channels WHERE id = ? AND deleted_at IS NULL",
		)
		.bind(id)
		.first<{ calendar_id: string }>();

	return data?.calendar_id ?? null;
};

export const deleteNotificationChannel = async (
	db: D1Database,
	id: string,
): Promise<void> => {
	await db
		.prepare(
			"UPDATE notification_channels SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
		)
		.bind(id)
		.run();
};
