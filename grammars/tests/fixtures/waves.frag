#version 330 core
uniform float time;
out vec4 color;
void main() {
  float glow = 0.5 + 0.5 * sin(time);
  color = vec4(glow, 0.2, 0.8, 1.0);
}
