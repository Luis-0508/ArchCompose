/**
 * ArchCompose icon set: drawn on a 20-unit grid with a 1.5 stroke, square caps,
 * in the spirit of drafting symbols. Icons are decorative by default; the
 * surrounding control provides the accessible name.
 */
const paths = {
  compose: "M2 15.5h16M10 15.5 4 4.5M10 15.5l6-11M10 15.5V4.5M2.5 9.5h15",
  drawings: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM3 10h14M10 3v7M13 6.5l-3-3.5-3 3.5",
  boards: "M2.5 4.5h15v11h-15zM2.5 8h15M8 8v7.5M12.5 8v7.5",
  select: "M5 3.5v12l3.4-3.2 2.4 5 2-.9-2.3-4.9H15z",
  hand: "M7 10V4.8a1.2 1.2 0 0 1 2.4 0V9m0-4.8V3.4a1.2 1.2 0 0 1 2.4 0V9m0-4.2a1.2 1.2 0 0 1 2.4 0V10m0-3a1.2 1.2 0 0 1 2.4 0v4.5c0 3.3-2.4 5.5-5.5 5.5-2.4 0-3.6-1-5-3l-2.4-3.6a1.2 1.2 0 0 1 2-1.4L7 10.5",
  zoom: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12.2 12.2l4.3 4.3M6.5 8.5h4M8.5 6.5v4",
  horizon: "M2 10.5h16M6 14.5h8M8.5 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z",
  perspective: "M2 16 10 6l8 10M2 16h16M5.5 11.5h9M10 6V3",
  mask: "M3.5 3.5h13v13h-13zM10 6.5a3.5 3.5 0 1 0 0 7Z",
  shadow: "M7 3.5v8M5 5.5h4M4 16.5h12M7 11.5l9 5",
  segment: "M4 16 13 7M12 3.5v2M15.5 7h2M14.6 4.4l-1.4 1.4M3.5 8.5c2-1 2.6-2.6 3-4.5",
  adjust: "M4 3.5v13M10 3.5v13M16 3.5v13M2.5 6.5h3M8.5 13h3M14.5 9h3",
  export: "M10 13V3.5M6.5 7 10 3.5 13.5 7M3.5 12v4.5h13V12",
  import: "M10 3.5V13M6.5 9.5 10 13l3.5-3.5M3.5 12v4.5h13V12",
  undo: "M7 5 3.5 8.5 7 12M3.5 8.5h8a4.5 4.5 0 0 1 0 9H9",
  redo: "M13 5l3.5 3.5L13 12M16.5 8.5h-8a4.5 4.5 0 0 0 0 9H11",
  file: "M5 2.5h6.5l3.5 3.5v11.5H5zM11.5 2.5V6H15",
  folder: "M2.5 5.5v10h15v-8h-7.5L8 5.5z",
  save: "M4 3.5h9.5l2.5 2.5v10.5H4zM7 3.5v4h6v-4M7 16.5v-5h6v5",
  plus: "M10 4v12M4 10h12",
  minus: "M4 10h12",
  trash: "M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5.5M11.5 8.5v5.5",
  eye: "M2.5 10S5 5 10 5s7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5ZM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  eyeOff:
    "M3.5 3.5l13 13M8 5.3C8.6 5.1 9.3 5 10 5c5 0 7.5 5 7.5 5s-.8 1.6-2.4 3M12 14.7c-.6.2-1.3.3-2 .3-5 0-7.5-5-7.5-5s.8-1.6 2.4-3",
  lock: "M5 9h10v7.5H5zM7 9V6.5a3 3 0 0 1 6 0V9",
  unlock: "M5 9h10v7.5H5zM7 9V6.5a3 3 0 0 1 5.8-1",
  up: "M5.5 12 10 7.5l4.5 4.5",
  down: "M5.5 8 10 12.5 14.5 8",
  right: "M8 5.5l4.5 4.5L8 14.5",
  fit: "M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4",
  image: "M3 4.5h14v11H3zM3 13l4-4 3.5 3.5L13 10l4 4M12.5 7.5a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0Z",
  layers: "M10 3 2.5 7 10 11l7.5-4zM2.5 10.5 10 14.5l7.5-4M2.5 13.5 10 17.5l7.5-4",
  warning: "M10 3 2 16.5h16zM10 8v4M10 14v.5",
  error: "M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM7.3 7.3l5.4 5.4M12.7 7.3l-5.4 5.4",
  info: "M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM10 9v5M10 6v.5",
  check: "M4 10.5 8 14.5 16 5.5",
  close: "M5 5l10 10M15 5 5 15",
  panelLeft: "M2.5 3.5h15v13h-15zM7.5 3.5v13",
  panelRight: "M2.5 3.5h15v13h-15zM12.5 3.5v13",
  keyboard: "M2.5 5.5h15v9h-15zM5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6.5 11.5h7",
  text: "M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5",
  grid: "M3 3h14v14H3zM3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14",
  link: "M8.5 11.5l3-3M7 9.5 5 11.5a2.5 2.5 0 0 0 3.5 3.5l2-2M13 10.5l2-2A2.5 2.5 0 0 0 11.5 5l-2 2",
  revision: "M10 3 17 15H3zM10 7.5v3.5",
  compare: "M3 4h6v12H3zM11 4h6v12h-6zM10 2.5v15",
  check2: "M3.5 10.5 7.5 14.5 16.5 5.5",
  dot: "M10 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
} as const;

export type IconName = keyof typeof paths;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 18, className, title }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
