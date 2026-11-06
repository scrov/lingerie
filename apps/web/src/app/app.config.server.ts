import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { ApplicationConfig, REQUEST, REQUEST_CONTEXT, inject, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import type { SsrContext } from '../server';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { CMS_URL, PUBLIC_CMS_URL } from './cms/cms';

function ssrContext(): Partial<SsrContext> {
  return (inject(REQUEST_CONTEXT, { optional: true }) as Partial<SsrContext> | null) ?? {};
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // While rendering, read the CMS where server.ts says (inside the container: http://cms.internal/cms) ...
    { provide: CMS_URL, useFactory: () => ssrContext().cmsBase ?? PUBLIC_CMS_URL },
    // ... and store those responses under the URLs the browser will use (https://<site>/cms/…), so hydration
    // reuses them instead of fetching again.
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useFactory: (): Record<string, string> => {
        const cmsOrigin = ssrContext().cmsOrigin;
        const request = inject(REQUEST, { optional: true });
        return cmsOrigin && request ? { [cmsOrigin]: new URL(request.url).origin } : {};
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
