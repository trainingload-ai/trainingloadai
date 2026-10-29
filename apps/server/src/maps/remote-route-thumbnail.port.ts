export type RemoteRouteThumbnailRequest = {
  candidates: string[][]; height: number; width: number; mapStyle: string; routeColor: string;
};
export type RenderedRouteThumbnail = { buffer: Buffer; extension: string; mimeType: string };
type Renderer = (request: RemoteRouteThumbnailRequest) => Promise<RenderedRouteThumbnail>;
let renderer: Renderer | null = null;
export function registerRemoteRouteThumbnailRenderer(value: Renderer) {
  if (renderer) throw new Error('Remote route thumbnail renderer is already registered');
  renderer = value;
}
export function renderRemoteRouteThumbnail(request: RemoteRouteThumbnailRequest) {
  if (!renderer) throw new Error('REMOTE_ROUTE_THUMBNAIL_NOT_CONFIGURED');
  return renderer(request);
}
