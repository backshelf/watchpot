declare module "*.css";
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
declare module "*.ogg" {
  const url: string;
  export default url;
}
declare module "*.opus" {
  const url: string;
  export default url;
}
declare module "*.flac" {
  const url: string;
  export default url;
}
