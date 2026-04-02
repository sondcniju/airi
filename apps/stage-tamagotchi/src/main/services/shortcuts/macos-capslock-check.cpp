#include <ApplicationServices/ApplicationServices.h>
#include <iostream>

/**
 * Tiny macOS helper to check the status of the Caps Lock modifier flag.
 * This is used to bypass the unreliable globalShortcut listener for Caps Lock on macOS.
 */
int main() {
    // Access the current system-wide modifier state
    CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
    
    // Check if the Alpha Shift (Caps Lock) flag is set
    bool capsLockOn = (flags & kCGEventFlagMaskAlphaShift);
    
    // Output the state (1 for ON, 0 for OFF)
    std::cout << (capsLockOn ? "1" : "0") << std::endl;
    
    return 0;
}
