#include "config_common.h"

#define HAVE_FCNTL_H 1
#define HAVE_LOCALTIME_S 1

#define gid_t short
#define id_t unsigned long
#define mode_t unsigned short
#define pid_t int
#define uid_t short

#if defined(_WIN64)
#define ssize_t int64_t
#else
#define ssize_t long
#endif

#define _WIN32_WINNT 0x0A00
#define WINVER 0x0A00
#define NTDDI_VERSION 0x0A000000
