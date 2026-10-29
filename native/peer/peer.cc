// SECURITY: kernel-backed caller identity for the control socket (src/main/socket.ts).
// peerOf(fd): pid + uid of the process on the other end of a connected unix socket.
// parentOf(pid): its parent pid (process lineage), null if the process is gone.
// childrenOf(pid): pids of its direct children (busy terminals: a shell with children), null on error.
// nameOf(pid): its process name (`tie open --replace` errors), null if gone.
#include <napi.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/ucred.h>
#include <libproc.h>
#include <sys/proc_info.h>

static Napi::Value PeerOf(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) return env.Null();
  int fd = info[0].As<Napi::Number>().Int32Value();
  pid_t pid = 0;
  socklen_t len = sizeof(pid);
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID, &pid, &len) != 0 || pid <= 0) return env.Null();
  struct xucred cred;
  len = sizeof(cred);
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERCRED, &cred, &len) != 0 || cred.cr_version != XUCRED_VERSION)
    return env.Null();
  Napi::Object out = Napi::Object::New(env);
  out.Set("pid", Napi::Number::New(env, pid));
  out.Set("uid", Napi::Number::New(env, cred.cr_uid));
  return out;
}

static Napi::Value ParentOf(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) return env.Null();
  int pid = info[0].As<Napi::Number>().Int32Value();
  struct proc_bsdinfo bsd;
  if (pid <= 0 || proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &bsd, sizeof(bsd)) != (int)sizeof(bsd)) return env.Null();
  return Napi::Number::New(env, bsd.pbi_ppid);
}

static Napi::Value ChildrenOf(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) return env.Null();
  int pid = info[0].As<Napi::Number>().Int32Value();
  if (pid <= 0) return env.Null();
  static const int MAX = 4096;
  static pid_t pids[MAX];
  // Returns a count of pids (libproc divides proc_listpids' byte count), -1 on error.
  int n = proc_listchildpids(pid, pids, sizeof(pids));
  if (n < 0) return env.Null();
  if (n > MAX) n = MAX;
  Napi::Array out = Napi::Array::New(env);
  uint32_t k = 0;
  for (int i = 0; i < n; i++)
    if (pids[i] > 0) out.Set(k++, Napi::Number::New(env, pids[i]));
  return out;
}

static Napi::Value NameOf(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) return env.Null();
  int pid = info[0].As<Napi::Number>().Int32Value();
  if (pid <= 0) return env.Null();
  char name[2 * MAXCOMLEN + 1];
  int n = proc_name(pid, name, sizeof(name));
  if (n <= 0) return env.Null();
  return Napi::String::New(env, name, n);
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("peerOf", Napi::Function::New(env, PeerOf));
  exports.Set("parentOf", Napi::Function::New(env, ParentOf));
  exports.Set("childrenOf", Napi::Function::New(env, ChildrenOf));
  exports.Set("nameOf", Napi::Function::New(env, NameOf));
  return exports;
}

NODE_API_MODULE(peer, Init)
