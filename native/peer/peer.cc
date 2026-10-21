// SECURITY: kernel-backed caller identity for the control socket (src/main/socket.ts).
// peerOf(fd): pid + uid of the process on the other end of a connected unix socket.
// parentOf(pid): its parent pid (process lineage), null if the process is gone.
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

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("peerOf", Napi::Function::New(env, PeerOf));
  exports.Set("parentOf", Napi::Function::New(env, ParentOf));
  return exports;
}

NODE_API_MODULE(peer, Init)
