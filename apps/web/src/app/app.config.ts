import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // fetch-based HttpClient works in the browser and in the Cloudflare Worker during SSR.
    provideHttpClient(withFetch()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    // Hydration reuses the CMS responses fetched during server rendering instead of requesting them again.
    provideClientHydration(withEventReplay()),
    // CMS calls go to <site>/cms/… in the browser; for a local CMS start the server with CMS_INTERNAL_URL=http://localhost:8787.
  ],
};
