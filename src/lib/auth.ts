import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { AUTH_SECRET as LOCAL_AUTH_SECRET } from "@/lib/auth-secret";

const providers = [];

// 只在配置了密钥时才启用 OAuth
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

providers.push(
  Credentials({
    name: "用户名密码",
    credentials: {
      username: { label: "用户名", type: "text" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.username || !credentials?.password) return null;

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: credentials.username as string },
            { email: credentials.username as string },
          ],
        },
      });

      if (!user || !user.password) return null;

      const isValid = await bcrypt.compare(
        credentials.password as string,
        user.password
      );

      if (!isValid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    },
  })
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  // 优先级：Vercel 环境变量 > 构建时注入的本地文件 > undefined
  secret: process.env.AUTH_SECRET || LOCAL_AUTH_SECRET || undefined,
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as { id: string; name: string | null; email: string | null; image: string | null };
        u.id = token.sub!;
        u.name = token.name ?? null;
        u.email = token.email ?? null;
        u.image = (token.image ?? null) as (string | null);
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // 首次登录：写入 token（含 tokenVersion 用于改密后强制下线）
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { tokenVersion: true },
        });
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;
        token.tokenVersion = dbUser?.tokenVersion ?? 0;
      }

      // 用户修改个人信息时，前端调用 update(body)，此处即时更新 JWT
      if (trigger === "update" && session) {
        if (session.name !== undefined) token.name = session.name;
        if (session.email !== undefined) token.email = session.email;
        if (session.image !== undefined) token.image = session.image;
      }

      // 每次请求验证 tokenVersion：改密码后强制退出当前及所有已登录设备
      // 跳过首次登录（user 存在时刚写入，无需验证）和 profile 更新
      if (!user && trigger !== "update" && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { tokenVersion: true },
          });
          // 用户已被删除 → 销毁 token
          if (!dbUser) {
            console.warn(`[auth] tokenVersion 校验失败：用户 ${token.sub} 不存在`);
            return null;
          }
          // tokenVersion 不匹配（改密码后） → 销毁 token
          if (dbUser.tokenVersion !== (token.tokenVersion ?? 0)) {
            console.warn(`[auth] tokenVersion 不匹配：${token.sub}`);
            return null;
          }
        } catch (error) {
          // 数据库查询失败（如 Neon 冷启动/超时）→ 保留现有 token，不强制退出
          console.error("[auth] tokenVersion 数据库查询失败，保留现有会话:", error);
          return token;
        }
      }

      return token;
    },
  },
});
