import AppKit
import React

@objc(RNGlassEffectView)
class RNGlassEffectView: RCTViewManager {
    override func view() -> NSView! {
        return GlassEffectView()
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}

class GlassEffectView: NSView {
    private let contentContainer = NSView()
    private var glassEffectView: NSView?

    @objc var glassStyle: String = "regular" {
        didSet {
            updateGlassStyle()
        }
    }

    @objc var tintColor: NSColor? {
        didSet {
            updateTintColor()
        }
    }

    override var isFlipped: Bool {
        return true
    }

    override var mouseDownCanMoveWindow: Bool {
        get { true }
        set { /* no-op */ }
    }

    override init(frame: NSRect) {
        super.init(frame: frame)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    override func layout() {
        super.layout()
        contentContainer.frame = bounds
        glassEffectView?.frame = bounds
    }

    override func insertReactSubview(_ subview: NSView!, at atIndex: Int) {
        contentContainer.addSubview(subview)
    }

    private func setupView() {
        contentContainer.autoresizingMask = [.width, .height]
        contentContainer.frame = bounds
        contentContainer.wantsLayer = true
        contentContainer.layer?.backgroundColor = NSColor.clear.cgColor

        if #available(macOS 26.0, *) {
            let glassView = NSGlassEffectView(frame: bounds)
            glassView.autoresizingMask = [.width, .height]
            glassView.contentView = contentContainer
            glassView.wantsLayer = true
            glassView.layer?.backgroundColor = NSColor.clear.cgColor
            glassEffectView = glassView
            addSubview(glassView)
            updateGlassStyle()
            updateTintColor()
        } else {
            addSubview(contentContainer)
        }
    }

    private func updateGlassStyle() {
        guard #available(macOS 26.0, *) else {
            return
        }

        guard let glassView = glassEffectView as? NSGlassEffectView else {
            return
        }

        switch glassStyle {
        case "clear":
            glassView.style = .clear
        default:
            glassView.style = .regular
        }
    }

    private func updateTintColor() {
        guard #available(macOS 26.0, *) else {
            return
        }

        guard let glassView = glassEffectView as? NSGlassEffectView else {
            return
        }

        glassView.tintColor = tintColor
    }
}
