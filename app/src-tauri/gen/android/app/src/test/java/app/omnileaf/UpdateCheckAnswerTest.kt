package app.omnileaf

import org.junit.Assert.assertEquals
import org.junit.Test

class UpdateCheckAnswerTest {
    @Test
    fun `answers an ended check with its outcome and the status read after it`() {
        val run = CheckRun.Ended(CheckResult.UpToDate)

        val answer = checkAnswer(run) { statusReply(UpdateStatus.UpToDate, isAutomatic = true) }

        val reply = (answer as UpdateCheckAnswer.Replied).reply
        assertJson("""{"outcome":"upToDate","status":{"isAutomatic":true,"release":{"kind":"upToDate"}}}""", reply)
    }

    @Test
    fun `refuses a broken check with a fixed message and keeps the bug as its cause`() {
        val bug = NullPointerException()

        val answer = checkAnswer(CheckRun.Broke(bug)) { error("a broken check reads no status") }

        assertEquals(UpdateCheckAnswer.Refused("the update check broke", bug), answer)
    }
}
