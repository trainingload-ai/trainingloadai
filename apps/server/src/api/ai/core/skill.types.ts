export type CoachSkillDef = {
  /**
   * 技能名：用于日志、调试与后续扩展显式调用
   */
  name: string;
  aliases?: string[];
  /**
   * Internal composition skills can be activated by an application workflow
   * without appearing in the general conversational skill catalog.
   */
  catalogVisible?: boolean;
  /**
   * 面向开发者/调试的简述
   */
  description: string;
  /**
   * 何时应该激活该 skill
   */
  whenToUse: string;
  /**
   * 激活后优先暴露和排序的相关能力；不是固定调用顺序
   */
  suggestedTools?: string[];
  /**
   * 按需注入的领域知识、判断原则和完成条件
   */
  prompt: string;
};

export type ActiveCoachSkill = {
  name: string;
  description: string;
  whenToUse: string;
  suggestedTools: string[];
  prompt: string;
  activatedBy: string;
};
