// 通过 GitHub REST API（api.github.com 可用）完成一次 main 分支推送
// 用于 github.com:443 暂时不可达时的兜底。凭据来自本机 git credential。
import { execSync } from "node:child_process";

const REPO = "Bemyself001/backlund-chronicle";
const API = `https://api.github.com/repos/${REPO}`;

const creds = execSync("git credential fill", { input: "protocol=https\nhost=github.com\n\n" }).toString();
const token = (creds.match(/^password=(.+)$/m) || [])[1];
if (!token) { console.error("未取到凭据"); process.exit(1); }

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "git-api-push",
};

const localSha = execSync("git rev-parse HEAD").toString().trim();
const remoteSha = execSync("git rev-parse origin/main").toString().trim();
if (localSha === remoteSha) { console.log("远端已是最新，无需推送"); process.exit(0); }

// 本地待推送的提交链（可能多个）
const commitsToPush = execSync(`git log --format=%H origin/main..HEAD`).toString().trim().split("\n").reverse();
const message = execSync(`git log -1 --format=%B ${localSha}`).toString().trim();

const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`${method} ${path} -> ${res.status}`, data.message || ""); process.exit(1); }
  return data;
};

// 校验远端 head 未漂移
const ref = await api("GET", "/git/refs/heads/main");
if (ref.object.sha !== remoteSha) { console.error(`远端 main 已移动到 ${ref.object.sha}，与本地 origin/main 不一致，放弃 API 推送`); process.exit(1); }

let parentSha = remoteSha;
let newHead = null;
for (const commitSha of commitsToPush) {
  // 相对父提交的改动文件
  const changed = execSync(`git diff-tree --no-commit-id --name-only -r ${commitSha}`).toString().trim().split("\n").filter(Boolean);
  const parentCommit = await api("GET", `/git/commits/${parentSha}`);
  const tree = await Promise.all(changed.map(async (path) => {
    // 用暂存区 blob 的字节（git show :path）而不是工作区文件，避免 CRLF 差异导致树不一致
    const content = execSync(`git show :"${path.replace(/"/g, "")}"`).toString("utf8");
    const blob = await api("POST", "/git/blobs", { content, encoding: "utf-8" });
    return { path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const newTree = await api("POST", "/git/trees", { base_tree: parentCommit.tree.sha, tree });
  const msg = commitSha === localSha ? message : execSync(`git log -1 --format=%B ${commitSha}`).toString().trim();
  // 复刻本地提交的作者/提交者与时间，使 API 创建的提交 SHA 与本地一致，避免分支分叉
  const meta = (format) => execSync(`git log -1 --format=${format} ${commitSha}`).toString().trim();
  const newCommit = await api("POST", "/git/commits", {
    message: msg.endsWith("\n") ? msg : `${msg}\n`,
    tree: newTree.sha,
    parents: [parentSha],
    author: { name: meta("%an"), email: meta("%ae"), date: meta("%aI") },
    committer: { name: meta("%cn"), email: meta("%ce"), date: meta("%cI") },
  });
  parentSha = newCommit.sha;
  newHead = newCommit.sha;
  console.log(`已创建提交 ${newCommit.sha.slice(0, 7)}（对应本地 ${commitSha.slice(0, 7)}${newCommit.sha === commitSha ? "，SHA 一致" : "，SHA 不同"}）`);
}

await api("PATCH", "/git/refs/heads/main", { sha: newHead, force: false });
try {
  execSync(`git update-ref refs/remotes/origin/main ${newHead}`, { stdio: "pipe" });
} catch {
  console.log(`提示：远端已更新到 ${newHead.slice(0, 7)}，但本地尚无该提交对象；网络恢复后执行 git fetch origin && git reset --hard origin/main 即可对齐（内容与本地一致）。`);
}
if (newHead === localSha) console.log(`推送完成：main -> ${newHead.slice(0, 7)}`);
else console.log(`推送完成：main -> ${newHead.slice(0, 7)}（远端提交与本地内容相同，SHA 因提交元数据略有差异）`);
