cmake_minimum_required(VERSION 3.20)
project(MCWV-Launcher VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Rust core as static lib
# Build rust-core first: cargo build --release --manifest-path rust-core/Cargo.toml
# Then link libmcwv_core.a

add_executable(MCWV-Launcher WIN32
    src/main.cpp
)

target_include_directories(MCWV-Launcher PRIVATE include rust-core/src)

# Link Windows libs
target_link_libraries(MCWV-Launcher PRIVATE
    winhttp
    crypt32
    wbemuuid
    credui
    wtsapi32
    ole32
    oleaut32
)

# Static CRT for single .exe no deps
if(MSVC)
    set_property(TARGET MCWV-Launcher PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Release>:>")
    target_link_options(MCWV-Launcher PRIVATE /SUBSYSTEM:WINDOWS /MANIFEST:NO)
endif()

# Rust lib (if built)
if(EXISTS "${CMAKE_SOURCE_DIR}/rust-core/target/release/libmcwv_core.a")
    target_link_libraries(MCWV-Launcher PRIVATE "${CMAKE_SOURCE_DIR}/rust-core/target/release/libmcwv_core.a")
    add_definitions(-DHAVE_RUST_CORE)
else()
    message(WARNING "Rust core not built, using stub — run: cargo build --release --manifest-path rust-core/Cargo.toml")
endif()

# Version resource
configure_file(assets/version.rc.in assets/version.rc @ONLY)
target_sources(MCWV-Launcher PRIVATE assets/version.rc)
