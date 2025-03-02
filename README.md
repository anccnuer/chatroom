# chatroom
A web chatroom

## 思路
+ 使用ip作为唯一辨识
+ 当连接/结束连接到ws时，广播在线ip（或者**姓名**）
```javascript
{
    type: "online",
    list: [ip...],
    user_num: int,//未实现
    myip: ip,
}
```
+ 所有消息都是json格式
```javascript
{
    type: public | private,
    fromip: ip,
    toip: ip | public,
    message: string,
}
```
## todo
- [ ] 导入名单，并与ip对应
- [ ] 切换班级

## 启动
需要环境bun.js，当前最完善的版本为i3.ts
```bash
bun install & bun run i3.ts
```