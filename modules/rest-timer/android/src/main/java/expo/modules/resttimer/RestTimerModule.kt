package expo.modules.resttimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
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
      // Default importance so the countdown is listed with the alerting notifications and shown on the
      // lock screen (silent ones are folded away there); the notification itself is silent, the end
      // of the rest has its own alert. A channel's importance cannot change, hence the new id.
      val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_DEFAULT)
      channel.setShowBadge(false)
      channel.setSound(null, null)
      channel.enableVibration(false)
      channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      manager().createNotificationChannel(channel)
      manager().deleteNotificationChannel(OLD_CHANNEL_ID)
    }
    val openApp = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    // The time left, large, in the notification body: the header chronometer alone is tiny and some
    // phones hide it. Chronometer bases are on the elapsed-realtime clock, not the wall clock.
    val base = SystemClock.elapsedRealtime() + remainingMs
    val body = RemoteViews(context.packageName, R.layout.rest_timer_notification).apply {
      setTextViewText(R.id.rest_timer_title, title)
      setChronometer(R.id.rest_timer_clock, base, null, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) setChronometerCountDown(R.id.rest_timer_clock, true)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setCustomContentView(body)
      .setCustomBigContentView(body)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setWhen(endsAtMs)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setTimeoutAfter(remainingMs)
      .setContentIntent(openApp)
      .build()
    manager().notify(NOTIFICATION_ID, notification)
  }

  /** A plain white-on-transparent glyph: a full-colour or adaptive app icon can be refused as a small icon. */
  private fun smallIcon(): Int {
    val id = context.resources.getIdentifier("ic_rest_timer", "drawable", context.packageName)
    return if (id != 0) id else android.R.drawable.ic_lock_idle_alarm
  }

  companion object {
    private const val OLD_CHANNEL_ID = "workout-rest-countdown"
    private const val CHANNEL_ID = "workout-rest-countdown-live"
    private const val NOTIFICATION_ID = 7301
  }
}
