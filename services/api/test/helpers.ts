// app.listen(0) 으로 빈 포트에 띄우고 fetch 로 부른다.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(app: Express): Promise<TestServer> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
