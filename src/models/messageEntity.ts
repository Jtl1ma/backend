/*import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { FileEntity } from './fileEntity';

type MessageEntity = {
  content: string;
    senderId: string;
    status: 'sent' | 'delivered' | 'read' | 'sent';
}

@Entity('messages')
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  senderId: string;

  @Column({
    type: 'enum',
    enum: ['sent', 'delivered', 'read'],
    default: 'sent',
  })
  status: 'sent' | 'delivered' | 'read';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @ManyToOne(() => FileEntity, (file) => file.messages)
  @JoinColumn({ name: 'fileId' })
  file?: FileEntity;

  @Column({ nullable: true })
  fileId?: string;

  /*constructor(
    content: string,
    senderId: string,
    status: 'sent' | 'delivered' | 'read' = 'sent',
  ) {
    this.content = content;
    this.senderId = senderId;
    this.status = status;
    this.timestamp = new Date();
  }*/
//}
