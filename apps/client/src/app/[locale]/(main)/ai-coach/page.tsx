import { AiCoachClientLoader } from "./ai-coach-client-loader";

/** 无服务端数据获取；聊天运行时由客户端边界异步加载。 */
export default function AiCoachPage() {
  return <AiCoachClientLoader />;
}
