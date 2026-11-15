package app.omnileaf

import app.tauri.annotation.InvokeArg

@InvokeArg
class LockWords {
    lateinit var title: String
    lateinit var body: String
    lateinit var unlock: String
    lateinit var prompt: String
}
