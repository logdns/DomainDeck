import 'vue-router';

export {};

declare module 'vue-router' {
  interface RouteMeta {
    descriptionKey?: string;
    permissions?: string[];
  }
}
