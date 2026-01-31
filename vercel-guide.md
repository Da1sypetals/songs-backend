# Vercel Redis (KV) 部署完整教程

## 重要说明

**Vercel KV 产品已停用**。Vercel 现在通过 Vercel Marketplace 提供 Redis 存储解决方案，主要合作伙伴包括：
- **Upstash Redis** (推荐，无服务器 Redis)
- **Redis Cloud** (官方 Redis 云服务)

本教程将介绍如何使用 **Upstash Redis** 在 Vercel 上部署一个简单的后端服务。

---

## 第一部分：准备工作

### 1. 前置要求
- Vercel 账号（免费或付费）
- Node.js 和 npm 已安装
- 基本的 Next.js 或 Node.js 知识

---

## 第二部分：创建 Next.js 项目

### 1. 创建新项目

在终端运行：

```bash
npx create-next-app@latest my-redis-app
cd my-redis-app
```

选择配置：
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- App Router: Yes
- 其他选项根据需要选择

### 2. 安装 Upstash Redis SDK

```bash
npm install @upstash/redis
```

---

## 第三部分：在 Vercel UI 中配置 Redis

### 方式一：通过 Vercel Dashboard 创建（推荐）

#### 步骤 1: 访问 Vercel Dashboard
1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击顶部导航栏的 **"Storage"** 标签

#### 步骤 2: 创建数据库
1. 点击 **"Create Database"** 按钮
2. 在 "Storage partners" 下找到 **"View all partners"**
3. 选择 **"Upstash"** 或 **"Redis"**
4. 点击 **"Continue"**

#### 步骤 3: 配置数据库
有两个选项：

**选项 A：让 Vercel 管理新的 Upstash 账户**
1. 选择 **"Create New Upstash Account"**
2. 选择产品：**Redis**
3. 配置数据库：
   - **Database Name**: 输入名称（如 `my-redis-db`）
   - **Region**: 选择离用户最近的区域（如 `us-east-1`）
   - **Plan**: 选择 Free 或付费计划
4. 点击 **"Create"**
5. 等待数据库初始化完成（状态从 "Initializing" 变为 "Available"）

**选项 B：连接现有的 Upstash 账户**
1. 选择 **"Link Existing Upstash Account"**
2. 登录您的 Upstash 账户
3. 选择要集成的 Vercel 项目
4. 选择或创建 Upstash Redis 数据库
5. 点击 **"Save"**

#### 步骤 4: 连接到项目
1. 在 Storage 页面，找到刚创建的数据库
2. 点击数据库卡片
3. 点击 **"Connect Project"** 或进入 **"Settings"** 标签
4. 选择您的项目和环境（Development, Preview, Production）
5. 点击 **"Connect"**

这将自动添加以下环境变量到您的项目：
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

#### 步骤 5: 查看凭据
1. 在数据库详情页面的 **"Quickstart"** 标签
2. 可以看到连接字符串和环境变量
3. 点击 **"Show Secret"** 查看完整凭据

---

### 方式二：通过 Vercel Marketplace 安装

#### 步骤 1: 访问 Marketplace
1. 前往 [Vercel Marketplace - Upstash](https://vercel.com/integrations/upstash)
2. 或在 Vercel Dashboard 中点击 **"Marketplace"** → 搜索 "Upstash"

#### 步骤 2: 安装集成
1. 点击 **"Install"** 按钮
2. 选择要添加集成的 Vercel 账户
3. 选择权限范围（建议选择所有项目或特定项目）
4. 点击 **"Install"**

#### 步骤 3: 配置
按照上述"方式一"的步骤 3-5 完成配置。

---

## 第四部分：编写后端代码

### 1. 创建 API 路由

在 `app/api/` 目录下创建以下文件：

**app/api/test-redis/route.ts**

```typescript
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// 使用环境变量初始化 Redis 客户端
const redis = Redis.fromEnv();

export async function GET(request: NextRequest) {
  try {
    // 测试 Redis 连接
    await redis.set('test-key', 'Hello from Vercel Redis!');
    const value = await redis.get('test-key');
    
    return NextResponse.json({
      success: true,
      message: 'Redis connection successful',
      data: value
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;
    
    if (!key || !value) {
      return NextResponse.json({
        success: false,
        error: 'Key and value are required'
      }, { status: 400 });
    }
    
    // 设置键值对
    await redis.set(key, value);
    
    return NextResponse.json({
      success: true,
      message: 'Data saved successfully',
      key,
      value
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### 2. 创建完整的 CRUD API

**app/api/items/route.ts**

```typescript
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// 获取所有项目
export async function GET() {
  try {
    const keys = await redis.keys('item:*');
    const items = [];
    
    for (const key of keys) {
      const item = await redis.get(key);
      items.push({ id: key.replace('item:', ''), ...item });
    }
    
    return NextResponse.json({
      success: true,
      data: items
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 创建新项目
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;
    
    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Name is required'
      }, { status: 400 });
    }
    
    const id = Date.now().toString();
    const item = {
      name,
      description: description || '',
      createdAt: new Date().toISOString()
    };
    
    await redis.set(`item:${id}`, JSON.stringify(item));
    
    return NextResponse.json({
      success: true,
      data: { id, ...item }
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

**app/api/items/[id]/route.ts**

```typescript
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// 获取单个项目
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = await redis.get(`item:${params.id}`);
    
    if (!item) {
      return NextResponse.json({
        success: false,
        error: 'Item not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: { id: params.id, ...item }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 更新项目
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const existingItem = await redis.get(`item:${params.id}`);
    
    if (!existingItem) {
      return NextResponse.json({
        success: false,
        error: 'Item not found'
      }, { status: 404 });
    }
    
    const updatedItem = {
      ...existingItem,
      ...body,
      updatedAt: new Date().toISOString()
    };
    
    await redis.set(`item:${params.id}`, JSON.stringify(updatedItem));
    
    return NextResponse.json({
      success: true,
      data: { id: params.id, ...updatedItem }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 删除项目
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await redis.del(`item:${params.id}`);
    
    if (result === 0) {
      return NextResponse.json({
        success: false,
        error: 'Item not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### 3. 创建简单的前端界面（可选）

**app/page.tsx**

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Item {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    try {
      const response = await fetch('/api/items');
      const data = await response.json();
      if (data.success) {
        setItems(data.data);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      
      const data = await response.json();
      if (data.success) {
        setName('');
        setDescription('');
        fetchItems();
      }
    } catch (error) {
      console.error('Error creating item:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const response = await fetch(`/api/items/${id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        fetchItems();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  return (
    <main className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Vercel Redis Demo</h1>
      
      <form onSubmit={createItem} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-8">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
            rows={3}
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Item'}
        </button>
      </form>
      
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Items</h2>
        {items.map((item) => (
          <div key={item.id} className="bg-white shadow rounded p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold">{item.name}</h3>
                <p className="text-gray-600 mt-2">{item.description}</p>
                <p className="text-sm text-gray-400 mt-2">
                  Created: {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        
        {items.length === 0 && (
          <p className="text-gray-500">No items yet. Create one above!</p>
        )}
      </div>
    </main>
  );
}
```

---

## 第五部分：本地测试

### 1. 创建本地环境变量文件

创建 `.env.local` 文件：

```env
UPSTASH_REDIS_REST_URL=your_redis_url_here
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
```

获取凭据：
1. 在 Vercel Dashboard 中进入您的数据库
2. 在 **"Quickstart"** 或 **".env.local"** 标签下复制环境变量
3. 粘贴到 `.env.local` 文件

### 2. 运行开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 测试应用。

测试 API：
- GET: `http://localhost:3000/api/test-redis`
- POST: 使用 Postman 或 curl 测试

---

## 第六部分：部署到 Vercel

### 方式 1：通过 Git 自动部署（推荐）

#### 步骤 1: 推送代码到 Git
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-git-repo-url
git push -u origin main
```

#### 步骤 2: 在 Vercel 中导入项目
1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **"Add New..."** → **"Project"**
3. 选择您的 Git 仓库（GitHub, GitLab, 或 Bitbucket）
4. 点击 **"Import"**

#### 步骤 3: 配置项目
1. **Project Name**: 输入项目名称
2. **Framework Preset**: Vercel 会自动检测 Next.js
3. **Root Directory**: 保持默认（除非项目在子目录）
4. **Build Command**: 保持默认 `next build`
5. **Environment Variables**: 
   - 如果已在 Storage 中连接数据库，环境变量会自动添加
   - 否则手动添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`

#### 步骤 4: 部署
1. 点击 **"Deploy"**
2. 等待构建完成（通常 1-3 分钟）
3. 部署成功后，Vercel 会提供一个 URL

---

### 方式 2：通过 Vercel CLI 部署

#### 步骤 1: 安装 Vercel CLI
```bash
npm i -g vercel
```

#### 步骤 2: 登录
```bash
vercel login
```

#### 步骤 3: 部署
```bash
# 预览部署
vercel

# 生产部署
vercel --prod
```

---

## 第七部分：验证部署

### 1. 测试 API 端点

使用部署后的 URL 测试：

```bash
# 测试 GET
curl https://your-app.vercel.app/api/test-redis

# 测试 POST
curl -X POST https://your-app.vercel.app/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Item","description":"This is a test"}'
```

### 2. 在 Vercel Dashboard 查看日志
1. 进入项目页面
2. 点击 **"Deployments"** 标签
3. 选择最新的部署
4. 点击 **"Logs"** 查看运行日志

### 3. 在 Upstash Dashboard 查看数据
1. 登录 [Upstash Console](https://console.upstash.com/)
2. 选择您的 Redis 数据库
3. 点击 **"Data Browser"** 查看存储的数据

---

## 第八部分：高级功能

### 1. 使用 Redis 其他数据类型

**List (列表)**

```typescript
// 推送到列表
await redis.lpush('mylist', 'item1');
await redis.lpush('mylist', 'item2');

// 获取列表
const items = await redis.lrange('mylist', 0, -1);
```

**Hash (哈希)**

```typescript
// 设置哈希字段
await redis.hset('user:1', { name: 'John', age: 30 });

// 获取哈希字段
const name = await redis.hget('user:1', 'name');
const user = await redis.hgetall('user:1');
```

**Sorted Set (有序集合)**

```typescript
// 添加成员
await redis.zadd('leaderboard', { score: 100, member: 'player1' });
await redis.zadd('leaderboard', { score: 200, member: 'player2' });

// 获取排名
const top10 = await redis.zrange('leaderboard', 0, 9, { rev: true });
```

### 2. 设置过期时间

```typescript
// 设置 60 秒后过期
await redis.set('temp-key', 'temp-value', { ex: 60 });

// 或者使用 expire
await redis.set('key', 'value');
await redis.expire('key', 3600); // 1 小时
```

### 3. 批量操作

```typescript
// 使用 pipeline 批量操作
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key1');
const results = await pipeline.exec();
```

---

## 第九部分：监控和优化

### 1. 在 Vercel 中查看 Analytics
1. 进入项目
2. 点击 **"Analytics"** 标签
3. 查看请求次数、响应时间等指标

### 2. 在 Upstash 中查看指标
1. 登录 Upstash Console
2. 选择数据库
3. 点击 **"Metrics"** 查看：
   - 请求数
   - 带宽使用
   - 延迟
   - 错误率

### 3. 性能优化建议
- 使用适当的 Redis 数据结构
- 为临时数据设置过期时间
- 使用 pipeline 批量操作
- 选择离用户最近的区域
- 监控并优化查询性能

---

## 第十部分：常见问题

### Q1: 环境变量未生效？
**解决方案**:
1. 确保在 Vercel 项目设置中添加了环境变量
2. 确保选择了正确的环境（Development/Preview/Production）
3. 重新部署项目

### Q2: Redis 连接失败？
**解决方案**:
1. 检查环境变量是否正确
2. 确保数据库状态为 "Available"
3. 检查 Upstash 服务状态

### Q3: 如何清空 Redis 数据？
```typescript
// 删除所有键
const keys = await redis.keys('*');
for (const key of keys) {
  await redis.del(key);
}
```

或在 Upstash Console 的 Data Browser 中手动删除。

### Q4: 如何查看定价？
1. 免费层级：每天 10,000 次请求
2. 超出部分按使用量计费
3. 在 Vercel 或 Upstash Dashboard 查看详细定价
