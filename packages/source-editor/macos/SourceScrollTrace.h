#import <AppKit/AppKit.h>

// Temporary, opt-in diagnose probe. No document text or paths in events.
BOOL LESourceScrollTraceEnabled(void);
double LESourceScrollTraceClock(void);
void LESourceScrollTrace(NSString *event, id owner, NSDictionary *fields);
