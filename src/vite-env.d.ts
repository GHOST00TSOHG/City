declare module '@eztree/tree.js' { export const Tree: any; }
declare module '@eztree/presets/*' { const v: any; export default v; }

/** Set by vite.config.ts: whether optional public/ drop-ins existed at build time. */
declare const __HAS_TREE_SPECIES__: boolean;
declare const __HAS_ROBOT_GLB__: boolean;

/** Content hash of public/robot, for ?v= cache busting (vite.config.ts). */
declare const __ROBOT_V__: string;
