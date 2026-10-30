import { isEmailConfigured } from "~~/server/utils/email";

/** 公开的轻量运行配置（无敏感信息，仅暴露布尔开关） */
export default defineEventHandler(() => ({
  emailConfigured: isEmailConfigured(),
}));
