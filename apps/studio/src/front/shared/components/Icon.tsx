import { SvgIcon, type SvgIconProps } from "@mui/material";

export type IconName = "add" | "arrow" | "bolt" | "delete" | "dns" | "edit" | "globe" | "grid" | "hub" | "lan" | "memory" | "pipeline" | "refresh" | "settings";

/** Small code-native icon set used by the Studio shell. */
export const Icon = ({ name, ...props }: SvgIconProps & { name: IconName }) => {
  const paths: Record<IconName, React.ReactNode> = {
    add: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
    bolt: <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />,
    delete: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7" /><path d="M10 11v6m4-6v6" /></>,
    dns: <><rect x="4" y="4" width="16" height="6" rx="1" /><rect x="4" y="14" width="16" height="6" rx="1" /><path d="M8 7h.01M8 17h.01m4-10h5m-5 10h5" /></>,
    edit: <><path d="m4 20 4.1-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m13.5 7.5 3 3" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    hub: <><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="m7 7 3 3m4-1 3-3m-3 9 3 3" /></>,
    lan: <><rect x="8" y="3" width="8" height="5" rx="1" /><path d="M12 8v5M5 13h14M5 13v3m14-3v3" /><rect x="2" y="16" width="6" height="5" rx="1" /><rect x="16" y="16" width="6" height="5" rx="1" /></>,
    memory: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 9h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3" /></>,
    pipeline: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><path d="M7 5h3c3 0 3 7 6 7h1M7 19h3c3 0 3-7 6-7" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-5L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2" /><path d="M20 20v-4h-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.5 1a8 8 0 0 0-1.7-1L14.4 3h-4.8L9.3 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.6-1a8 8 0 0 0 1.7 1l.3 3h4.8l.3-3a8 8 0 0 0 1.7-1l2.6 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z" /></>,
  };
  return <SvgIcon {...props} sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", ...props.sx }}>{paths[name]}</SvgIcon>;
};
