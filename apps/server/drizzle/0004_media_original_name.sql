-- 记住上传时的原始文件名：落盘目录用得上它（uploads/小满-77bde782/2026-10/IMG_2041-04bae623/），
-- 导出 / 下载原图时也能给回一个人类可读的名字。
ALTER TABLE media ADD COLUMN original_name TEXT;
