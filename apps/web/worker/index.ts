import { DurableObject } from 'cloudflare:workers';

/**
 * Front Worker for lingerie.scrov.app.
 *
 *   visitor ─▶ static asset? ─yes─▶ served from ./dist/browser by Workers Static Assets (this code never runs)
 *                  │ no
 *                  ▼
 *             this Worker ─▶ Storefront Durable Object ─▶ Container running the Angular SSR server (Dockerfile)
 *
 * One container instance serves the whole site. The cron trigger keeps it warm so visitors don't wait for a cold start.
 */

const PORT = 8080;
const INSTANCE_NAME = 'storefront';
/** Container stops after this long with no requests (the cron trigger normally prevents that). Max 6 h. */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
/** How long a cold start may take before requests fail: 150 × 200 ms + per-attempt latency. */
const READY_ATTEMPTS = 150;

export class Storefront extends DurableObject<Env> {
	private starting: Promise<void> | undefined;
	private healthy = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const container = ctx.container;
		// The inactivity timeout doesn't survive a Durable Object restart; set it again.
		if (container?.running) {
			void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
		}
	}

	override async fetch(request: Request): Promise<Response> {
		await this.ready();
		try {
			return await this.forward(request);
		} catch (error) {
			// The process may have just exited (rollout, crash). Safe requests get one retry on a fresh start.
			this.healthy = false;
			if (request.method !== 'GET' && request.method !== 'HEAD') throw error;
			console.warn(JSON.stringify({ msg: 'container_retry', error: String(error) }));
			await this.ready();
			return this.forward(request);
		}
	}

	/** Called by the cron trigger. Starts the container if needed and confirms it answers. */
	async warm(): Promise<void> {
		await this.ready();
	}

	private forward(request: Request): Promise<Response> {
		const url = new URL(request.url);
		url.protocol = 'http:';
		url.host = 'container';
		const forwarded = new Request(url, request);
		forwarded.headers.delete('host');
		return this.container().getTcpPort(PORT).fetch(forwarded);
	}

	private container(): Container {
		const container = this.ctx.container;
		if (!container) throw new Error('No container is configured for the Storefront Durable Object');
		return container;
	}

	/** Concurrent requests share one start and readiness check. */
	private ready(): Promise<void> {
		if (this.healthy && this.container().running) return Promise.resolve();
		this.starting ??= this.startAndWaitForPort()
			.then(() => {
				this.healthy = true;
			})
			.finally(() => {
				this.starting = undefined;
			});
		return this.starting;
	}

	private async startAndWaitForPort(): Promise<void> {
		const container = this.container();
		if (!container.running) {
			const started = Date.now();
			container.start({
				// The SSR server fetches content from the CMS at lingerie-cms.scrov.app.
				enableInternet: true,
				env: { PORT: String(PORT), PUBLIC_ORIGIN: this.env.PUBLIC_ORIGIN, NODE_ENV: 'production' },
			});
			console.log(JSON.stringify({ msg: 'container_starting', at: started }));
		}
		await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

		const port = container.getTcpPort(PORT);
		let lastError: unknown;
		for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
			try {
				const res = await port.fetch('http://container/healthz', { signal: AbortSignal.timeout(1000) });
				await res.body?.cancel();
				if (res.ok) return;
				lastError = new Error(`Health check returned ${res.status}`);
			} catch (error) {
				lastError = error;
			}
			await scheduler.wait(200);
		}
		throw new Error('Storefront container did not become ready', { cause: lastError });
	}
}

function storefront(env: Env): DurableObjectStub<Storefront> {
	// The boutique and the CMS database are in eastern North America; keep the Durable Object there too.
	return env.STOREFRONT.getByName(INSTANCE_NAME, { locationHint: 'enam' });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		// The container trusts these headers, so always overwrite whatever the visitor sent.
		const headers = new Headers(request.headers);
		headers.set('X-Forwarded-Host', url.host);
		headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));
		headers.delete('X-Forwarded-For');
		const ip = request.headers.get('CF-Connecting-IP');
		if (ip) headers.set('X-Forwarded-For', ip);

		try {
			return await storefront(env).fetch(new Request(request, { headers }));
		} catch (error) {
			console.error(JSON.stringify({ msg: 'storefront_unavailable', path: url.pathname, error: String(error) }));
			return new Response(UNAVAILABLE_HTML, {
				status: 503,
				headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'no-store' },
			});
		}
	},

	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(storefront(env).warm());
	},
} satisfies ExportedHandler<Env>;

const UNAVAILABLE_HTML = `<!doctype html>
<html lang="fr-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lingerie &amp; Maillots Christine</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fdfbf8;color:#1d2233;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}h1{color:#0a2a88;font-size:28px;margin:0 0 8px}</style>
</head><body><main><h1>Lingerie &amp; Maillots Christine</h1>
<p>Le site se met à jour. Réessayez dans quelques secondes.</p>
<p>1085, boulevard Lachapelle, Saint-Jérôme · <a href="tel:+14503043555">450-304-3555</a></p></main></body></html>`;
