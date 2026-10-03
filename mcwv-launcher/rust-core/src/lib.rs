// MCWV Core — memory-safe crypto for C++ launcher
// FIXED v3: correct Hmac generic + KeyInit import, tested with hmac 0.12.1 + sha2 0.10.9 + Rust 1.99

use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use digest::KeyInit;

type HmacSha256 = Hmac;

#[no_mangle]
pub extern "C" fn mcwv_sha256(input: *const u8, len: usize, out: *mut u8) -> i32 {
    if input.is_null() || out.is_null() { return -1; }
    unsafe {
        let slice = std::slice::from_raw_parts(input, len);
        let mut hasher = Sha256::new();
        hasher.update(slice);
        let result = hasher.finalize();
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    }
    0
}

#[no_mangle]
pub extern "C" fn mcwv_hmac_sha256(key: *const u8, key_len: usize, data: *const u8, data_len: usize, out: *mut u8) -> i32 {
    if key.is_null() || data.is_null() || out.is_null() { return -1; }
    unsafe {
        let key_slice = std::slice::from_raw_parts(key, key_len);
        let data_slice = std::slice::from_raw_parts(data, data_len);
        let mut mac = match HmacSha256::new_from_slice(key_slice) {
            Ok(m) => m,
            Err(_) => return -2,
        };
        mac.update(data_slice);
        let result = mac.finalize().into_bytes();
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    }
    0
}

#[no_mangle]
pub extern "C" fn mcwv_generate_hwid(cpu: *const u8, cpu_len: usize, mb: *const u8, mb_len: usize, disk: *const u8, disk_len: usize, salt: *const u8, salt_len: usize, out: *mut u8) -> i32 {
    if cpu.is_null() || mb.is_null() || disk.is_null() || salt.is_null() || out.is_null() { return -1; }
    unsafe {
        let cpu_s = std::slice::from_raw_parts(cpu, cpu_len);
        let mb_s = std::slice::from_raw_parts(mb, mb_len);
        let disk_s = std::slice::from_raw_parts(disk, disk_len);
        let salt_s = std::slice::from_raw_parts(salt, salt_len);
        let mut hasher = Sha256::new();
        hasher.update(cpu_s);
        hasher.update(b"|");
        hasher.update(mb_s);
        hasher.update(b"|");
        hasher.update(disk_s);
        hasher.update(b"|");
        hasher.update(salt_s);
        let result = hasher.finalize();
        std::ptr::copy_nonoverlapping(result.as_ptr(), out, 32);
    }
    0
}

#[no_mangle]
pub extern "C" fn mcwv_verify_signature(macro_data: *const u8, macro_len: usize, key: *const u8, key_len: usize, expected_sig: *const u8, sig_len: usize) -> i32 {
    if macro_data.is_null() || key.is_null() || expected_sig.is_null() { return -1; }
    if sig_len != 32 { return -2; }
    unsafe {
        let data = std::slice::from_raw_parts(macro_data, macro_len);
        let key_slice = std::slice::from_raw_parts(key, key_len);
        let expected = std::slice::from_raw_parts(expected_sig, 32);
        let mut mac = match HmacSha256::new_from_slice(key_slice) {
            Ok(m) => m,
            Err(_) => return -3,
        };
        mac.update(data);
        let result = mac.finalize().into_bytes();
        if result.as_slice() == expected { 0 } else { 1 }
    }
}
