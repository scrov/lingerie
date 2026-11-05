import { Routes } from '@angular/router';

// Paths match the old site (/page/…, /blog/…, /blog/categorie/…) so existing links and search results keep working.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'page/:slug', loadComponent: () => import('./pages/content-page').then((m) => m.ContentPage) },
  { path: 'blog', loadComponent: () => import('./pages/blog-list').then((m) => m.BlogList) },
  { path: 'blog/categorie/:category', loadComponent: () => import('./pages/blog-list').then((m) => m.BlogList) },
  { path: 'blog/:slug', loadComponent: () => import('./pages/blog-post').then((m) => m.BlogPost) },
  { path: 'contact', loadComponent: () => import('./pages/contact').then((m) => m.Contact) },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
];
