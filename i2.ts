// i2.ts

interface Client {
    ws: WebSocket;
    ip: string;
    state: 'open' | 'closed'; // 用户状态
}

// 存储所有连接的 WebSocket 客户端（IP 地址作为键）
const clients = new Map<string, Client>();

// 创建一个 Bun 服务器
const server = Bun.serve({
    port: 3000, // 服务器端口
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
            // 检查 ws 和 ws.remoteAddress 是否存在
            if (!ws || !ws.remoteAddress) {
                console.error('WebSocket or remoteAddress is undefined');
                return;
            }
            const ip = normalizeIP(ws.remoteAddress); // 获取客户端的 IP 地址

            // 添加到客户端 map
            clients.set(ip, {
                ws,
                ip,
                state: 'open',
            });

            console.log(`New client connected: ${ip}`);

            // 广播用户加入消息和当前在线列表
            broadcastMessage({
                type: 'online',
                message: `User ${ip} joined`,
                onlineUsers: Array.from(clients.keys()),
            });
        },
        message(ws, event: MessageEvent<string>) {
            handleMessage(ws, event); // 传递 ws 对象
        },
        close(ws) {
            handleDisconnect(ws);
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
function handleMessage(ws: WebSocket, event: MessageEvent<string>) {
    // 检查 ws 和 ws.remoteAddress 是否存在
    if (!ws || !ws.remoteAddress) {
        console.error('WebSocket or remoteAddress is undefined');
        return;
    }
    const ip = normalizeIP(ws.remoteAddress); // 获取当前用户的 IP

    // 检查 event.data 是否为有效的字符串
    if (typeof event.data !== 'string') {
        console.error(`Received non-string data from ${ip}:`, event.data);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format: data is not a string',
                    onlineUsers: getOnlineUsers(),
                })
            );
            console.log(`Sent error message to ${ip} because data is not a string`);
        }
        return;
    }

    try {
        const data = JSON.parse(event.data);

        if (
            typeof data !== 'object' ||
            data === null ||
            !('fromip' in data) ||
            !('toip' in data) ||
            !('message' in data)
        ) {
            throw new Error('Invalid message format');
        }

        const { fromip, toip, message } = data;

        if (fromip !== ip) {
            throw new Error('Invalid fromip');
        }

        console.log(`Received message from ${ip}:`, data); // 添加日志

        if (toip === 'public') {
            // 广播消息给所有用户
            broadcastMessage({
                type: 'message',
                fromip,
                message,
                onlineUsers: getOnlineUsers(),
            });
            console.log(`Broadcasted message from ${ip}:`, { type: 'message', fromip, message, onlineUsers: getOnlineUsers() }); // 添加日志
        } else {
            // 私聊消息
            if (isIpOnline(toip)) {
                // 发送私聊消息给目标用户
                clients.get(toip)!.ws.send(
                    JSON.stringify({
                        type: 'private',
                        fromip,
                        message,
                        onlineUsers: getOnlineUsers(),
                    })
                );
                console.log(`Sent private message from ${ip} to ${toip}:`, { type: 'private', fromip, message, onlineUsers: getOnlineUsers() }); // 添加日志
            } else {
                // 如果目标用户不在线，回复发送方
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        message: `User ${toip} is not online`,
                        onlineUsers: getOnlineUsers(),
                    })
                );
                console.log(`Sent error message to ${ip} because ${toip} is not online`); // 添加日志
            }
        }
    } catch (error) {
        console.error(`Error handling message from ${ip}:`, error);

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format',
                    onlineUsers: getOnlineUsers(),
                })
            );
            console.log(`Sent error message to ${ip} because of invalid message format`); // 添加日志
        }
    }
}


// 处理用户断开连接
function handleDisconnect(ws: WebSocket) {
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
            message: `User ${ip} left`,
            onlineUsers: getOnlineUsers(),
        });
    }
}

// 广播消息给所有在线用户
function broadcastMessage(data: Record<string, any>) {
    console.log(`Broadcasting message:`, data); // 添加日志
    for (const client of clients.values()) {
        if (client.state === 'open' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
            console.log(`Sent message to ${client.ip}:`, data); // 添加日志
        }
    }
}

console.log(`Server is running on http://localhost:${server.port}`);
