// i2.ts

import type { ServerWebSocket } from "bun";

interface Client {
    ws: ServerWebSocket<unknown>;
    ip: string;
    state: 'open' | 'closed'; // 用户状态
}

// 存储所有连接的 WebSocket 客户端（IP 地址作为键）
const clients = new Map<string, Client>();

// 创建一个 Bun 服务器
const server = Bun.serve({
    port: 3030, // 服务器端口
    fetch(req: Request, server: any) {
        const url = new URL(req.url);

        // 如果是 WebSocket 请求，升级到 WebSocket
        if (url.pathname === "/ws") {
            const success = server.upgrade(req);
            if (success) {
                return;
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
        open(ws) {
            const ip = normalizeIP(ws.remoteAddress); // 获取客户端的 IP 地址
            // 添加到客户端 map
            clients.set(ip, {
                ws,
                ip,
                state: 'open',
            });
            ws.send(JSON.stringify({ type: "online", myip:ip, list: getOnlineUsers() }));

            console.log(`New client connected: ${ip}`);
        },
        message(ws, message) {
            handleMessage(ws, message)
        },
        close(ws) {
            handleDisconnect(ws)
        }
    },
});

// 获取在线用户 IP 列表
function getOnlineUsers(): string[] {
    return Array.from(clients.keys());
}

// 解析 IP 地址
function normalizeIP(ip: string): string {
    return ip.replace(/^::ffff:/, ''); // 去掉 IPv4-mapped IPv6 前缀
}

// 判断 IP 是否在线
function isIpOnline(targetIP: string): boolean {
    return clients.has(targetIP) && clients.get(targetIP)!.state === 'open';
}
// 处理 WebSocket 消息
function handleMessage(ws: ServerWebSocket<unknown>, event: any) {
    const ip = normalizeIP(ws.remoteAddress); // 获取当前用户的 IP

    // 检查 event.data 是否为有效的字符串
    if (typeof event !== 'string') {
        console.error(`Received non-string data from ${ip}:`, event);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format: data is not a string',
                    // onlineUsers: getOnlineUsers(),
                })
            );
            console.log(`Sent error message to ${ip} because data is not a string`);
        }
        return;
    }

    const data = JSON.parse(event);
    // 校验数据类型
    if (
        typeof data !== 'object' ||
        data === null ||
        !('toip' in data) ||
        !('message' in data)
    ) {
        throw new Error('Invalid message format');
    }

    if (data.toip === 'public') {
        broadcastMessage({...data, fromip:ip});
        // console.log(`Broadcasted message from ${ip}:`, `{ type: 'message',${data.fromip}, ${data.message} }`); // 添加日志
        
    } else {
        console.log(data.toip,isIpOnline(data.toip))
        if (isIpOnline(data.toip)) {
            // 发送私聊消息给目标用户
            clients.get(data.toip)!.ws.send(
                JSON.stringify({
                    type: 'private',
                    fromip: ip,
                    toip: data.toip,
                    message: data.message
                })
            );
        }
    }

}

function broadcastMessage(data: Record<string, any>) {
    console.log(`Broadcasting message:`, data); // 添加日志
    for (const client of clients.values()) {
        if (client.state === 'open' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
            console.log(`Sent message to ${client.ip}:`, data); // 添加日志
        }
    }
}

function handleDisconnect(ws: ServerWebSocket<unknown>) {
    // 检查 ws 和 ws.remoteAddress 是否存在
    if (!ws || !ws.remoteAddress) {
        console.error('WebSocket or remoteAddress is undefined');
        return;
    }
    const ip = normalizeIP(ws.remoteAddress);
    const client = clients.get(ip);
    if (client) {
        client.state = 'closed';
        clients.delete(ip);

        console.log(`Client disconnected: ${ip}`);

        // 广播用户离开消息和当前在线列表
        broadcastMessage({
            type: 'online',
            onlineUsers: getOnlineUsers(),
        });
    }
}
console.log(`Server is running on http://localhost:${server.port}`);