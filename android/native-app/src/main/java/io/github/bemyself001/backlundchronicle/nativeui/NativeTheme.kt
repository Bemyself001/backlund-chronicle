package io.github.bemyself001.backlundchronicle.nativeui

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

internal val Green = Color(0xFF153D34)
internal val Brass = Color(0xFFAD8650)
internal val Paper = Color(0xFFF4EEDF)
internal val Ink = Color(0xFF29372F)

// Keep the established Web HUD colours identical across both clients.
internal object ChronicleVitals {
    val health = Color(0xFFEFA29A)
    val sanity = Color(0xFF99C5F0)
    val spirituality = Color(0xFFE6C56F)
}

private val DayColors = lightColorScheme(
    primary = Green, onPrimary = Color(0xFFFFFCF4),
    primaryContainer = Green, onPrimaryContainer = Paper,
    secondary = Color(0xFF856332), onSecondary = Color.White,
    secondaryContainer = Color(0xFFEADCC0), onSecondaryContainer = Color(0xFF503C22),
    tertiary = Color(0xFF516959), onTertiary = Color.White,
    background = Paper, onBackground = Ink,
    surface = Color(0xFFFAF6EC), onSurface = Ink,
    surfaceVariant = Color(0xFFE9E1D0), onSurfaceVariant = Color(0xFF687165),
    outline = Color(0xFFB4A68B), outlineVariant = Color(0xFFDACDB5),
    error = Color(0xFF9B463D), onError = Color.White,
    errorContainer = Color(0xFFF7DDD6), onErrorContainer = Color(0xFF6A2B24),
)

private val NightColors = darkColorScheme(
    primary = Color(0xFFCBBB98), onPrimary = Color(0xFF111B24),
    primaryContainer = Color(0xFF111B24), onPrimaryContainer = Color(0xFFE8E2D3),
    secondary = Color(0xFFB6A277), onSecondary = Color(0xFF111B24),
    secondaryContainer = Color(0xFF343A40), onSecondaryContainer = Color(0xFFE7D6B1),
    tertiary = Color(0xFFA4BCC9), onTertiary = Color(0xFF111B24),
    background = Color(0xFF111B24), onBackground = Color(0xFFE8E2D3),
    surface = Color(0xFF1B2833), onSurface = Color(0xFFE8E2D3),
    surfaceVariant = Color(0xFF283744), onSurfaceVariant = Color(0xFFADB8BD),
    outline = Color(0xFF65717A), outlineVariant = Color(0xFF384652),
    error = Color(0xFFF0ABA0), onError = Color(0xFF492720),
    errorContainer = Color(0xFF4A302A), onErrorContainer = Color(0xFFF6D7CD),
)

private val ChronicleTypography = Typography(
    headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 20.sp, lineHeight = 27.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 16.sp, lineHeight = 26.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 18.sp),
    labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, lineHeight = 16.sp),
)

@Composable
internal fun NativeTheme(dark: Boolean, content: @Composable () -> Unit) {
    val window = (LocalContext.current as? Activity)?.window
    SideEffect {
        window?.let { WindowCompat.getInsetsController(it, it.decorView).isAppearanceLightNavigationBars = !dark }
    }
    MaterialTheme(
        colorScheme = if (dark) NightColors else DayColors,
        typography = ChronicleTypography,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(8.dp),
            medium = RoundedCornerShape(8.dp), large = RoundedCornerShape(12.dp),
            extraLarge = RoundedCornerShape(16.dp),
        ),
        content = content,
    )
}
