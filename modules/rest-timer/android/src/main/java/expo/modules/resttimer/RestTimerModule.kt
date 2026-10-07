package expo.modules.resttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The rest countdown in the notification shade. The system draws the ticking clock itself
 * (a count-down chronometer), so it stays exact with the app in the background or closed.
 * One fixed id: showing again replaces the previous countdown instead of adding another.
 */
class RestTimerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RestTimer")

    Function("show") { endsAtMs: Double, title: String, channelName: String ->
      show(endsAtMs.toLong(), title, channelName)
    }

    Function("hide") {
      manager().cancel(NOTIFICATION_ID)
    }
  }

  private fun manager(): NotificationManager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun show(endsAtMs: Long, title: String, channelName: String) {
    val remainingMs = endsAtMs - System.currentTimeMillis()
    if (remainingMs <= 0) {
      manager().cancel(NOTIFICATION_ID)
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Low importance: no sound or pop-up, the end of the rest is announced by its own alert.
      val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager().createNotificationChannel(channel)
    }
    val openApp = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setWhen(endsAtMs)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setTimeoutAfter(remainingMs)
      .setContentIntent(openApp)
      .build()
    manager().notify(NOTIFICATION_ID, notification)
  }

  companion object {
    private const val CHANNEL_ID = "workout-rest-countdown"
    private const val NOTIFICATION_ID = 7301
  }
}
