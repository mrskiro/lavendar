export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		console.log(url);

		if (url.pathname.startsWith('/api/')) {
			// TODO
		}

		return new Response('Hello, world!');
	},
};
