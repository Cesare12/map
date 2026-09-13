import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let iconOutput = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: iconOutput, withIntermediateDirectories: true)
let green = NSColor(calibratedRed: 36/255, green: 100/255, blue: 71/255, alpha: 1)
let white = NSColor.white

enum Kind: String, CaseIterable {
  case food, coffee, pet, car, shopping, sport, outdoors, entertainment, service, health, sight, other
}
enum State: String, CaseIterable { case want, visited }

func stroke(_ path: NSBezierPath, _ color: NSColor, _ width: CGFloat = 4) {
  color.setStroke(); path.lineWidth = width; path.lineCapStyle = .round; path.lineJoinStyle = .round; path.stroke()
}
func fill(_ path: NSBezierPath, _ color: NSColor) { color.setFill(); path.fill() }
func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> NSBezierPath {
  NSBezierPath(ovalIn: NSRect(x: x-r, y: y-r, width: r*2, height: r*2))
}
func markerPath() -> NSBezierPath {
  let p = NSBezierPath()
  p.move(to: NSPoint(x: 36, y: 84))
  p.curve(to: NSPoint(x: 4, y: 53), controlPoint1: NSPoint(x: 18.3, y: 84), controlPoint2: NSPoint(x: 4, y: 70.7))
  p.curve(to: NSPoint(x: 36, y: 4), controlPoint1: NSPoint(x: 4, y: 29), controlPoint2: NSPoint(x: 36, y: 4))
  p.curve(to: NSPoint(x: 68, y: 53), controlPoint1: NSPoint(x: 36, y: 4), controlPoint2: NSPoint(x: 68, y: 29))
  p.curve(to: NSPoint(x: 36, y: 84), controlPoint1: NSPoint(x: 68, y: 70.7), controlPoint2: NSPoint(x: 53.7, y: 84))
  p.close()
  return p
}
func drawGlyph(_ kind: Kind, color: NSColor) {
  switch kind {
  case .food:
    let bowl = NSBezierPath()
    bowl.move(to: NSPoint(x: 22, y: 50)); bowl.line(to: NSPoint(x: 50, y: 50))
    bowl.curve(to: NSPoint(x: 36, y: 35), controlPoint1: NSPoint(x: 50, y: 41), controlPoint2: NSPoint(x: 44, y: 35))
    bowl.curve(to: NSPoint(x: 22, y: 50), controlPoint1: NSPoint(x: 28, y: 35), controlPoint2: NSPoint(x: 22, y: 41))
    stroke(bowl, color)
    let rim = NSBezierPath(); rim.move(to: NSPoint(x: 19, y: 50)); rim.line(to: NSPoint(x: 53, y: 50)); stroke(rim, color)
    for (x, top) in [(28.0, 68.0), (40.0, 69.0)] {
      let steam = NSBezierPath(); steam.move(to: NSPoint(x: x, y: 58)); steam.curve(to: NSPoint(x: x+3, y: top), controlPoint1: NSPoint(x: x-2, y: 62), controlPoint2: NSPoint(x: x+4, y: 64)); stroke(steam, color, 3.5)
    }
  case .coffee:
    let cup = NSBezierPath(); cup.move(to: NSPoint(x: 22, y: 56)); cup.line(to: NSPoint(x: 48, y: 56)); cup.line(to: NSPoint(x: 45, y: 38)); cup.curve(to: NSPoint(x: 25, y: 38), controlPoint1: NSPoint(x: 39, y: 34), controlPoint2: NSPoint(x: 30, y: 34)); cup.close(); stroke(cup, color)
    let handle = NSBezierPath(); handle.move(to: NSPoint(x: 48, y: 53)); handle.curve(to: NSPoint(x: 48, y: 42), controlPoint1: NSPoint(x: 58, y: 54), controlPoint2: NSPoint(x: 58, y: 42)); stroke(handle, color, 3.5)
    let steam = NSBezierPath(); steam.move(to: NSPoint(x: 31, y: 63)); steam.curve(to: NSPoint(x: 34, y: 72), controlPoint1: NSPoint(x: 27, y: 67), controlPoint2: NSPoint(x: 37, y: 68)); stroke(steam, color, 3.5)
  case .pet:
    fill(circle(36, 46, 9), color)
    fill(circle(22, 56, 5), color); fill(circle(30, 66, 5), color); fill(circle(42, 66, 5), color); fill(circle(50, 56, 5), color)
  case .car:
    let car = NSBezierPath()
    car.move(to: NSPoint(x: 20, y: 43)); car.line(to: NSPoint(x: 24, y: 57))
    car.curve(to: NSPoint(x: 30, y: 62), controlPoint1: NSPoint(x: 25, y: 60), controlPoint2: NSPoint(x: 27, y: 62))
    car.line(to: NSPoint(x: 42, y: 62)); car.curve(to: NSPoint(x: 48, y: 57), controlPoint1: NSPoint(x: 45, y: 62), controlPoint2: NSPoint(x: 47, y: 60))
    car.line(to: NSPoint(x: 52, y: 43)); car.line(to: NSPoint(x: 52, y: 34)); car.line(to: NSPoint(x: 47, y: 34)); car.line(to: NSPoint(x: 47, y: 38)); car.line(to: NSPoint(x: 25, y: 38)); car.line(to: NSPoint(x: 25, y: 34)); car.line(to: NSPoint(x: 20, y: 34)); car.close()
    stroke(car, color)
    let wind = NSBezierPath(); wind.move(to: NSPoint(x: 24, y: 47)); wind.line(to: NSPoint(x: 48, y: 47)); stroke(wind, color, 3.5)
    fill(circle(28, 42, 2), color); fill(circle(44, 42, 2), color)
  case .shopping:
    let bag = NSBezierPath(roundedRect: NSRect(x: 21, y: 35, width: 30, height: 27), xRadius: 3, yRadius: 3); stroke(bag, color)
    let handle = NSBezierPath(); handle.move(to: NSPoint(x: 28, y: 59)); handle.curve(to: NSPoint(x: 44, y: 59), controlPoint1: NSPoint(x: 28, y: 73), controlPoint2: NSPoint(x: 44, y: 73)); stroke(handle, color, 3.5)
  case .sport:
    stroke(circle(36, 51, 17), color)
    let seam = NSBezierPath(); seam.move(to: NSPoint(x: 20, y: 47)); seam.curve(to: NSPoint(x: 51, y: 55), controlPoint1: NSPoint(x: 31, y: 42), controlPoint2: NSPoint(x: 42, y: 64)); stroke(seam, color, 3)
    let seam2 = NSBezierPath(); seam2.move(to: NSPoint(x: 34, y: 35)); seam2.curve(to: NSPoint(x: 39, y: 67), controlPoint1: NSPoint(x: 45, y: 43), controlPoint2: NSPoint(x: 28, y: 57)); stroke(seam2, color, 3)
  case .outdoors:
    let mountains = NSBezierPath(); mountains.move(to: NSPoint(x: 18, y: 38)); mountains.line(to: NSPoint(x: 32, y: 66)); mountains.line(to: NSPoint(x: 39, y: 53)); mountains.line(to: NSPoint(x: 45, y: 62)); mountains.line(to: NSPoint(x: 55, y: 38)); mountains.close(); stroke(mountains, color)
    let snow = NSBezierPath(); snow.move(to: NSPoint(x: 27, y: 55)); snow.line(to: NSPoint(x: 32, y: 50)); snow.line(to: NSPoint(x: 36, y: 56)); stroke(snow, color, 3)
  case .entertainment:
    let ticket = NSBezierPath(roundedRect: NSRect(x: 18, y: 39, width: 36, height: 24), xRadius: 5, yRadius: 5); stroke(ticket, color)
    let split = NSBezierPath(); split.move(to: NSPoint(x: 36, y: 41)); split.line(to: NSPoint(x: 36, y: 61)); stroke(split, color, 3)
    fill(circle(27, 51, 3), color); fill(circle(45, 51, 3), color)
  case .service:
    let wrench = NSBezierPath(); wrench.move(to: NSPoint(x: 23, y: 67)); wrench.curve(to: NSPoint(x: 37, y: 54), controlPoint1: NSPoint(x: 17, y: 56), controlPoint2: NSPoint(x: 26, y: 49)); wrench.line(to: NSPoint(x: 51, y: 40)); wrench.curve(to: NSPoint(x: 44, y: 33), controlPoint1: NSPoint(x: 56, y: 35), controlPoint2: NSPoint(x: 49, y: 28)); wrench.line(to: NSPoint(x: 31, y: 47)); wrench.curve(to: NSPoint(x: 23, y: 67), controlPoint1: NSPoint(x: 23, y: 48), controlPoint2: NSPoint(x: 16, y: 59)); stroke(wrench, color)
  case .health:
    let cross = NSBezierPath(); cross.move(to: NSPoint(x: 31, y: 68)); cross.line(to: NSPoint(x: 41, y: 68)); cross.line(to: NSPoint(x: 41, y: 56)); cross.line(to: NSPoint(x: 53, y: 56)); cross.line(to: NSPoint(x: 53, y: 46)); cross.line(to: NSPoint(x: 41, y: 46)); cross.line(to: NSPoint(x: 41, y: 34)); cross.line(to: NSPoint(x: 31, y: 34)); cross.line(to: NSPoint(x: 31, y: 46)); cross.line(to: NSPoint(x: 19, y: 46)); cross.line(to: NSPoint(x: 19, y: 56)); cross.line(to: NSPoint(x: 31, y: 56)); cross.close(); fill(cross, color)
  case .sight:
    let flag = NSBezierPath(); flag.move(to: NSPoint(x: 25, y: 34)); flag.line(to: NSPoint(x: 25, y: 69)); flag.line(to: NSPoint(x: 51, y: 64)); flag.line(to: NSPoint(x: 44, y: 53)); flag.line(to: NSPoint(x: 51, y: 43)); flag.line(to: NSPoint(x: 25, y: 47)); stroke(flag, color)
  case .other:
    let star = NSBezierPath(); let pts = 10
    for i in 0..<pts {
      let a = CGFloat.pi/2 + CGFloat(i) * CGFloat.pi/5
      let r: CGFloat = i % 2 == 0 ? 15 : 7
      let pt = NSPoint(x: 36 + cos(a)*r, y: 51 + sin(a)*r)
      i == 0 ? star.move(to: pt) : star.line(to: pt)
    }
    star.close(); stroke(star, color)
  }
}

func pngData(_ image: NSImage) -> Data {
  guard let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]) else { fatalError("PNG encode failed") }
  return png
}
func drawCheckBadge() {
  let badge = circle(57, 69, 11)
  fill(badge, white); stroke(badge, green, 2.5)
  let check = NSBezierPath(); check.move(to: NSPoint(x: 52, y: 69)); check.line(to: NSPoint(x: 56, y: 65)); check.line(to: NSPoint(x: 63, y: 73)); stroke(check, green, 3)
}

for kind in Kind.allCases {
  for state in State.allCases {
    let image = NSImage(size: NSSize(width: 72, height: 88))
    image.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    let pin = markerPath()
    // 遵循 Apple 的完成状态语言：未完成保持描边，完成后使用实心并明确显示勾。
    if state == .want { fill(pin, white); stroke(pin, green, 3) }
    else { fill(pin, green); stroke(pin, white, 3) }
    drawGlyph(kind, color: state == .want ? green : white)
    if state == .visited { drawCheckBadge() }
    image.unlockFocus()
    try pngData(image).write(to: output.appendingPathComponent("\(kind.rawValue)-\(state.rawValue).png"))
  }

  let icon = NSImage(size: NSSize(width: 72, height: 72))
  icon.lockFocus()
  let transform = NSAffineTransform(); transform.translateX(by: 0, yBy: -15); transform.concat()
  drawGlyph(kind, color: green)
  icon.unlockFocus()
  try pngData(icon).write(to: iconOutput.appendingPathComponent("\(kind.rawValue).png"))
}

let allIcon = NSImage(size: NSSize(width: 72, height: 72))
allIcon.lockFocus()
for x in [22.0, 40.0] { for y in [22.0, 40.0] { fill(NSBezierPath(roundedRect: NSRect(x: x, y: y, width: 12, height: 12), xRadius: 3, yRadius: 3), green) } }
allIcon.unlockFocus()
try pngData(allIcon).write(to: iconOutput.appendingPathComponent("all.png"))
