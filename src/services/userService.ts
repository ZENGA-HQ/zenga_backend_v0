import { AppDataSource } from '../config/database';
import { User, UserType } from '../entities/User';
import { UserAddress } from '../entities/UserAddress';

export async function createUserIfNotExists(
    email: string,
    password: string,
    userType: UserType = UserType.INDIVIDUAL,
    companyId?: string,
    emailOTP?: string,
    emailOTPExpiry?: Date
) {
    const userRepository = AppDataSource.getRepository(User);
    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) return null;
    const user = userRepository.create({
        email,
        password,
        userType,
        companyId: companyId || null,
        emailOTP: emailOTP || null,
        emailOTPExpiry: emailOTPExpiry || null
    });
    await userRepository.save(user);
    return user;
}

export async function saveUserAddresses(user: User, addresses: any[]) {
    const addressRepo = AppDataSource.getRepository(UserAddress);
    for (const addr of addresses) {
        try {
            await addressRepo.save({ ...addr, user, userId: user.id });
            console.log('[DEBUG] Saved address:', { ...addr, userId: user.id });
        } catch (err) {
            console.error(
                '[DEBUG] Failed to save address:',
                { ...addr, userId: user.id },
                err
            );
        }
    }
    return addressRepo.find({ where: { userId: user.id as string } });
}
