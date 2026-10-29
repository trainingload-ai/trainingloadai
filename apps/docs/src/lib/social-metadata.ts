export const HOME_OPEN_GRAPH_IMAGE_PATH = "/og/home.jpg?v=20260912";
export const HOME_TWITTER_IMAGE_PATH = HOME_OPEN_GRAPH_IMAGE_PATH;

export function homeOpenGraphImage(
  url: string = HOME_OPEN_GRAPH_IMAGE_PATH,
) {
  return {
    url,
    width: 2400,
    height: 1260,
    alt: "Trainingload.ai endurance training platform",
    type: "image/jpeg",
  } as const;
}

export function homeTwitterImage(url: string = HOME_TWITTER_IMAGE_PATH) {
  return homeOpenGraphImage(url);
}
