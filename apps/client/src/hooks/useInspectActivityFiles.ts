import { useMutation } from "@tanstack/react-query";
import { inspectActivityFiles } from "@/api/activities";

/**
 * 针对上传的文件进行检查，返回文件的格式、种类、活动、健康等信息。
 * @returns 检查结果
 */
export function useInspectActivityFiles() {
  return useMutation({ mutationFn: inspectActivityFiles });
}
