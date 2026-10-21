import SwiftUI
import WebKit

@main
struct RockmanDASHApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .statusBarHidden()
        }
    }
}

private struct GameView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false

        guard let gameURL = Bundle.main.url(forResource: "game", withExtension: "html") else {
            return webView
        }
        var components = URLComponents(url: gameURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "variant", value: "localized"),
            URLQueryItem(name: "app", value: nil),
            URLQueryItem(name: "touch", value: nil),
        ]
        webView.loadFileURL(
            components?.url ?? gameURL,
            allowingReadAccessTo: gameURL.deletingLastPathComponent()
        )
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
