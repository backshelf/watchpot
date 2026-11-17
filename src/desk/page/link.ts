// The page's line to the desk server: the WebSocket at `/ws`, behind a small interface so a test can stand in for it.
import type { ToClient, ToServer } from "../protocol";

export interface DeskLink {
  send(msg: ToServer): void;
  close(): void;
}

export interface LinkHandlers {
  /** The line is up; `link` is the one `connect` returned. */
  onOpen(link: DeskLink): void;
  onMessage(msg: ToClient): void;
  onClose(): void;
}

/** Opens a line; calls `onOpen` once it can carry a message (never before `connect` has returned). */
export type Connect = (handlers: LinkHandlers) => DeskLink;

/** The real line: a WebSocket to the page's own host. `close` is silent. */
export const connectSocket: Connect = (handlers) => {
  const url = new URL("/ws", location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const link: DeskLink = {
    send: (msg) => socket.send(JSON.stringify(msg)),
    close: () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    },
  };
  socket.onopen = () => handlers.onOpen(link);
  socket.onmessage = (e) => {
    if (typeof e.data === "string") handlers.onMessage(JSON.parse(e.data) as ToClient);
  };
  socket.onclose = () => handlers.onClose();
  return link;
};
