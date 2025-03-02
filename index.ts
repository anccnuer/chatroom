// index.ts

// 存储所有连接的 WebSocket 客户端
const clients = new Map<unknown, string>(); // 使用 unknown 类型，稍后通过类型推断解决

// 创建一个 Bun 服务器
const server = Bun.serve({
  port: 3000, // 服务器端口
  fetch(req, server) {
    const url = new URL(req.url);

    // 如果是 WebSocket 请求，升级到 WebSocket
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) {
        return; // 不需要返回响应，因为已经升级到 WebSocket
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // 如果是根路径，返回前端页面
    if (url.pathname === "/") {
      return new Response(Bun.file("./public/index.html"));
    }

    // 其他情况返回 404
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    // WebSocket 事件处理
    open(ws) {
      const ip = normalizeIP(ws.remoteAddress); // 获取客户端的 IP 地址
      console.log(`New client connected: ${ip}`);
      clients.set(ws, ip); // 将客户端和 IP 存储到 Map 中

      // 广播新用户加入的消息
      broadcast(`${ip} joined the chat. ${clients.size} users online`);
    },
    message(ws, message) {
      const ip = clients.get(ws); // 获取当前客户端的 IP
      if (ip) {
        // 广播收到的消息，附带用户 IP
        broadcast(`${ip}: ${message}`);
      }
    },
    close(ws, code, reason) {
      const ip = clients.get(ws); // 获取当前客户端的 IP
      if (ip) {
        console.log(`Client disconnected: ${ip}`);
        clients.delete(ws); // 移除断开连接的客户端

        // 广播用户离开的消息
        broadcast(`${ip} left the chat. ${clients.size} users online`);
      }
    },
  },
});

function normalizeIP(ip: string): string {
    return ip.replace(/^::ffff:/, ""); // 去掉 IPv4-mapped IPv6 前缀
  }

// 广播消息给所有客户端
function broadcast(message: string) {
  for (const client of clients.keys()) {
    if ((client as { readyState: number }).readyState === 1) { // 1 表示 OPEN 状态
      (client as { send(data: string): void }).send(message);
    }
  }
}

console.log(`Server is running on http://localhost:${server.port}`);