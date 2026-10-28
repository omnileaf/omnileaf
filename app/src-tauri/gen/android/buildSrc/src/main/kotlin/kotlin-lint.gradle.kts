import com.android.build.api.dsl.CommonExtension
import io.gitlab.arturbosch.detekt.Detekt

plugins {
    id("com.diffplug.spotless")
    id("io.gitlab.arturbosch.detekt")
}

val catalog = the<VersionCatalogsExtension>().named("libs")
val ktlintVersion = catalog.findVersion("ktlint").get().requiredVersion
val tauriGeneratedSources = "**/generated/**"

spotless {
    kotlin {
        target("src/**/*.kt")
        targetExclude(tauriGeneratedSources)
        ktlint(ktlintVersion).editorConfigOverride(mapOf("ktlint_code_style" to "ktlint_official"))
    }
}

detekt {
    toolVersion = catalog.findVersion("detekt").get().requiredVersion
    buildUponDefaultConfig = true
    config.setFrom(isolated.rootProject.projectDirectory.file("config/detekt/detekt.yml"))
}

tasks.withType<Detekt>().configureEach {
    exclude(tauriGeneratedSources)
}

extensions.configure<CommonExtension> {
    lint.apply {
        warningsAsErrors = true
        abortOnError = true
        disable += setOf("AndroidGradlePluginVersion", "GradleDependency", "NewerVersionAvailable")
    }
}
