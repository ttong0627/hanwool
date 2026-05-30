package com.hanwool.delivery

import android.os.Build
import android.telephony.SmsManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 출발 문자 자동 발송용 네이티브 모듈.
 * expo-sms(문자앱 컴포저)와 달리 SmsManager로 사용자 확인 없이 직접 발송한다.
 * SEND_SMS 권한 필요(런타임 요청은 JS에서). Android 전용.
 */
class DirectSmsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DirectSms"

  @ReactMethod
  fun sendSms(phone: String, message: String, promise: Promise) {
    try {
      val sms: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        reactApplicationContext.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }
      val parts = sms.divideMessage(message)
      if (parts.size > 1) {
        sms.sendMultipartTextMessage(phone, null, parts, null, null)
      } else {
        sms.sendTextMessage(phone, null, message, null, null)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SMS_FAIL", e.message, e)
    }
  }
}
