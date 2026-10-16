// server/src/utils/respond.js
//
// Centralised response helpers so every endpoint uses the exact shape
// from CONTRACTS.md §3 without repeating the same object literal everywhere.
//
// Usage:
//   ok(res, data)                     -> 200 { success:true, data }
//   ok(res, data, 201)                -> 201 { success:true, data }
//   fail(res, 400, 'SOME_CODE', 'msg')-> 400 { success:false, error:{code,message} }

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

module.exports = { ok, fail };
