#include "config_posix.h"

#define HAVE_ARC4RANDOM_BUF 1

#if __ANDROID_API__ >= 26
#define HAVE_LANGINFO_H 1
#define HAVE_NL_LANGINFO 1
#endif
