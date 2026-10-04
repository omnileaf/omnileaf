package app.omnileaf

import android.content.pm.ActivityInfo
import android.content.res.Configuration

private const val TABLET_SMALLEST_WIDTH_DP = 600

/** How the app's screen turns: with the device while a book is read, upright on phones everywhere else. */
sealed interface ScreenOrientation {
  fun requestedOn(configuration: Configuration): Int

  data object FollowDevice : ScreenOrientation {
    override fun requestedOn(configuration: Configuration): Int = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }

  data object PortraitOnPhones : ScreenOrientation {
    override fun requestedOn(configuration: Configuration): Int =
      if (configuration.smallestScreenWidthDp < TABLET_SMALLEST_WIDTH_DP) ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT
      else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }
}
