package io.github.bemyself001.backlundchronicle.nativeui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource

@Composable
internal fun NativeBackdrop(dark: Boolean) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Image(
            painter = painterResource(if (dark) R.drawable.archive_night else R.drawable.archive_day),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            alignment = Alignment.BottomEnd,
            contentScale = ContentScale.Crop,
            alpha = if (dark) .85f else .75f,
        )
    }
}
