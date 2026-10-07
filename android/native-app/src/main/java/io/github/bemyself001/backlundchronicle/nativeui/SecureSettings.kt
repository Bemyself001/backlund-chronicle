package io.github.bemyself001.backlundchronicle.nativeui

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

class SecureSettings(context: Context) {
    private val preferences = context.getSharedPreferences("native-settings", Context.MODE_PRIVATE)
    private val keyFile = AtomicFile(File(context.noBackupFilesDir, "api-key.bin"))
    private val alias = "backlund-native-api-key"
    fun settings(): JSONObject = JSONObject(preferences.getString("settings", "{}") ?: "{}")
    fun prompt(): String? = preferences.getString("prompt", null)
    fun prompt(value: String) { check(preferences.edit().putString("prompt", value).commit()) }
    fun save(settings: JSONObject, apiKey: String) {
        val safe = JSONObject(settings.toString()).apply { remove("apiKey"); remove("profiles") }
        if (safe.optBoolean("persistKey") && apiKey.isNotBlank()) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val bytes = byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + cipher.doFinal(apiKey.toByteArray(Charsets.UTF_8))
            val output = keyFile.startWrite()
            try { output.write(bytes); keyFile.finishWrite(output) } catch (error: Exception) { keyFile.failWrite(output); throw error }
        } else keyFile.delete()
        check(preferences.edit().putString("settings", safe.toString()).commit()) { "设置保存失败" }
    }
    fun savedKey(): String {
        if (!settings().optBoolean("persistKey") || !keyFile.baseFile.exists()) return ""
        return try {
            val bytes = keyFile.openRead().use { it.readBytes() }
            val ivLength = bytes[0].toInt() and 255
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(1, 1 + ivLength)))
            cipher.doFinal(bytes.copyOfRange(1 + ivLength, bytes.size)).toString(Charsets.UTF_8)
        } catch (_: Exception) { "" }
    }
    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
}
