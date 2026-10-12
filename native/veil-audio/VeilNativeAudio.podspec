require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'VeilNativeAudio'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Proprietary' }
  s.homepage = 'https://github.com/linjingzhu/toilet-sound'
  s.author = 'VEIL'
  s.source = { :git => 'https://github.com/linjingzhu/toilet-sound.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor', '~> 8.0'
  s.framework = 'AVFoundation'
  s.swift_version = '5.0'
end
