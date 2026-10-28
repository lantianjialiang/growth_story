-- 账号角色：admin 可以管理其他账号，user 只能使用被授权的档案
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- 上次登录时间，账号列表里用来看「这个账号还活着吗」
ALTER TABLE users ADD COLUMN last_login_at TEXT;

-- 升级前就存在的账号里，最早创建的那个提升为管理员，保证升级后有人能管理账号
UPDATE users
SET role = 'admin'
WHERE id = (
  SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1
);
